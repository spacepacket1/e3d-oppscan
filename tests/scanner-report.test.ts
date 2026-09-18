import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ notFound }));

import ScannerReportPage from "../app/report/[token]/page";
import { GET as consultation } from "../app/report/[token]/consultation/route";
import {
  InMemoryScannerReportStore,
  deriveReportAccessToken,
  hashReportAccessToken,
  setScannerReportStoreForTests,
} from "@/lib/scanner-report-store";
import {
  setScannerTelemetrySinkForTests,
  type ScannerTelemetryEvent,
} from "@/lib/scanner-telemetry";

describe("scanner report authorization and telemetry", () => {
  let token: string;
  let telemetry: Mock<(event: ScannerTelemetryEvent) => void>;

  beforeEach(async () => {
    vi.stubEnv("SCANNER_REPORT_TOKEN_SECRET", "test-scanner-report-token-secret-32-bytes");
    const store = new InMemoryScannerReportStore();
    const scanId = "scan_authorized_customer";
    token = deriveReportAccessToken(scanId);
    await store.acquireGenerationLease(scanId, "owner", 1, 100);
    await store.completeReport(scanId, "owner", {
      candidates: [{
        id: "safe-candidate", title: "Safe", summary: "Summary", outcomeType: "augmentation",
        impact: 4, feasibility: 4, timeToValue: 4, confidence: 4, risk: 1,
        evidence: ["Evidence"], firstStep: "Start", score: 350, rank: 1,
      }],
      report: {
        executiveSummary: "Summary", recommendedStartingPoint: "Start",
        opportunities: [{ candidateId: "safe-candidate", headline: "Safe", whyItMatters: "Why",
          practicalApproach: "How", considerations: ["Care"] }],
        consultationPreparation: ["Owner?", "Baseline?"], closingNote: "Close",
      },
    }, hashReportAccessToken(token), "2026-09-10T00:00:00.000Z");
    telemetry = vi.fn();
    setScannerReportStoreForTests(store);
    setScannerTelemetrySinkForTests(telemetry);
  });

  afterEach(() => {
    setScannerReportStoreForTests(undefined);
    setScannerTelemetrySinkForTests(undefined);
    vi.unstubAllEnvs();
    notFound.mockClear();
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
