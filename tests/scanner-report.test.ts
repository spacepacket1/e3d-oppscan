import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ notFound, redirect: vi.fn() }));

// Minimal in-memory stand-in for next/headers' cookies() -- enough for this
// module's get/set usage. Real cookie semantics (expiry, domain, etc.) are
// irrelevant here; the tests only need get() to see what set() last wrote.
const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

import ScannerReportPage from "../app/report/[token]/page";
import { GET as consultation } from "../app/report/[token]/consultation/route";
import {
  InMemoryScannerReportStore,
  deriveReportAccessToken,
  deriveReportEmailProof,
  hashReportAccessToken,
  reportEmailCookieName,
  setScannerReportStoreForTests,
} from "@/lib/scanner-report-store";
import {
  setScannerTelemetrySinkForTests,
  type ScannerTelemetryEvent,
} from "@/lib/scanner-telemetry";

const CHECKOUT_EMAIL = "buyer@example.com";

describe("scanner report authorization and telemetry", () => {
  let token: string;
  let telemetry: Mock<(event: ScannerTelemetryEvent) => void>;

  beforeEach(async () => {
    cookieJar.clear();
    vi.stubEnv("SCANNER_REPORT_TOKEN_SECRET", "test-scanner-report-token-secret-32-bytes");
    const store = new InMemoryScannerReportStore();
    const scanId = "scan_authorized_customer";
    token = deriveReportAccessToken(scanId);
    await store.acquireGenerationLease(scanId, "owner", 1, 100);
    await store.completeReport(scanId, "owner", {
      candidates: [{
        id: "safe-candidate", title: "Safe", summary: "Summary", outcomeType: "augmentation",
        impact: 4, feasibility: 4, timeToValue: 4, confidence: 4, risk: 1,
        evidence: ["Evidence"], firstStep: "Start", score: 350, rank: 1, pointValue: 10,
      }],
      report: {
        executiveSummary: "Summary", recommendedStartingPoint: "Start",
        opportunities: [{ candidateId: "safe-candidate", headline: "Safe", whyItMatters: "Why",
          practicalApproach: ["How"], considerations: ["Care"] }],
        consultationPreparation: ["Owner?", "Baseline?"], closingNote: "Close",
      },
      baseScore: 50,
      potentialScore: 60,
      checkoutEmail: CHECKOUT_EMAIL,
    }, hashReportAccessToken(token), "2026-09-10T00:00:00.000Z");
    // Simulates having already passed the email-confirmation gate, so these
    // authorization/telemetry tests can focus on what they're actually
    // testing rather than re-proving the gate itself on every case.
    cookieJar.set(
      reportEmailCookieName(),
      deriveReportEmailProof(scanId, CHECKOUT_EMAIL),
    );
    telemetry = vi.fn();
    setScannerReportStoreForTests(store);
    setScannerTelemetrySinkForTests(telemetry);
  });

  afterEach(() => {
    setScannerReportStoreForTests(undefined);
    setScannerTelemetrySinkForTests(undefined);
    vi.unstubAllEnvs();
    notFound.mockClear();
    cookieJar.clear();
  });

  it("emits one authorized view and one configured booking click", async () => {
    await ScannerReportPage({ params: Promise.resolve({ token }) });
    await ScannerReportPage({ params: Promise.resolve({ token }) });
    vi.stubEnv("NEXT_PUBLIC_BOOKING_URL", "https://booking.example.com/consult");
    const request = new Request(`https://oppscan.e3d.ai/report/${token}/consultation`);
    const first = await consultation(request, { params: Promise.resolve({ token }) });
    const second = await consultation(request, { params: Promise.resolve({ token }) });
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe("https://booking.example.com/consult");
    expect(second.status).toBe(302);
    expect(telemetry.mock.calls.map(([event]) => event.eventName)).toEqual([
      "scanner_report_viewed", "scanner_consultation_clicked",
    ]);
    expect(telemetry.mock.calls[1][0]).toMatchObject({ destinationType: "booking" });
    expect(JSON.stringify(telemetry.mock.calls)).not.toContain(token);
  });

  it("uses contact fallback and emits nothing for malformed or unknown tokens", async () => {
    vi.stubEnv("NEXT_PUBLIC_BOOKING_URL", "");
    const validRequest = new Request(`https://oppscan.e3d.ai/report/${token}/consultation`);
    const response = await consultation(validRequest, { params: Promise.resolve({ token }) });
    expect(response.headers.get("location")).toBe("https://applied.futco.ai/contact");
    expect(telemetry.mock.calls[0][0]).toMatchObject({ destinationType: "contact" });
    telemetry.mockClear();
    for (const invalid of ["bad+token", deriveReportAccessToken("scan_other_customer")]) {
      await expect(ScannerReportPage({ params: Promise.resolve({ token: invalid }) })).rejects.toThrow("NOT_FOUND");
      await expect(consultation(validRequest, { params: Promise.resolve({ token: invalid }) })).rejects.toThrow("NOT_FOUND");
    }
    expect(telemetry).not.toHaveBeenCalled();
  });
});
