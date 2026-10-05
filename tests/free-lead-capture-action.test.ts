import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const securityMocks = vi.hoisted(() => ({
  isTrustedServerActionOrigin: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));
const rateLimitMocks = vi.hoisted(() => ({ isFreeAnalysisRateLimited: vi.fn() }));
const analysisMocks = vi.hoisted(() => ({ generateFreeScannerCandidates: vi.fn() }));
const deliveryMocks = vi.hoisted(() => ({ deliverFreeLead: vi.fn() }));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/contact-security", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contact-security")>("@/lib/contact-security");
  return { ...actual, ...securityMocks };
});
vi.mock("@/lib/scanner-free-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scanner-free-rate-limit")>("@/lib/scanner-free-rate-limit");
  return { ...actual, ...rateLimitMocks };
});
vi.mock("@/lib/scanner-analysis", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scanner-analysis")>("@/lib/scanner-analysis");
  return { ...actual, ...analysisMocks };
});
vi.mock("@/lib/scanner-free-lead-delivery", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scanner-free-lead-delivery")>("@/lib/scanner-free-lead-delivery");
  return { ...actual, ...deliveryMocks };
});

import { submitFreeLeadCapture, submitFreeScannerIntake } from "../app/free/actions";
import { emptyFreeLeadValues } from "@/lib/scanner-free-lead";
import { clearFreeLeadRateLimitForTests } from "@/lib/scanner-free-lead-rate-limit";
import { emptyFreeScannerIntakeValues } from "@/lib/scanner-free-intake";
import { verifyFreeSummary } from "@/lib/scanner-free-summary-token";
import { InMemoryScannerReportStore, setScannerReportStoreForTests } from "@/lib/scanner-report-store";
import { rankScannerCandidates } from "@/lib/scanner-scoring";

const SECRET = "test-scanner-report-token-secret-32-bytes";
const FB_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]";

const candidates = Array.from({ length: 5 }, (_, i) => ({
  id: `c${i + 1}`,
  title: `Opportunity ${i + 1}`,
  summary: `Summary ${i + 1}`,
  outcomeType: "automation" as const,
  impact: 5 - i,
  feasibility: 4,
  timeToValue: 3,
  confidence: 4,
  risk: 2,
  evidence: ["Evidence"],
  firstStep: "Start",
}));

function summaryForm() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    companyWebsite: "https://redwoodfab.example.com/private/path",
    companyName: "Redwood Fabrication",
    industry: "Fabrication",
    companyDescription: "Sheet metal work.",
    goalPrimary: "Faster quotes",
    timeConsumingWorkflows: "Takeoffs",
    currentAiUse: "None",
  })) f.set(k, v);
  return f;
}

function leadForm(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function getSummaryToken() {
  const state = await submitFreeScannerIntake(
    { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
    summaryForm(),
  );
  return state.summaryToken as string;
}

function capture(fields: Record<string, string>) {
  return submitFreeLeadCapture(
    { status: "idle", values: emptyFreeLeadValues, errors: {} },
    leadForm(fields),
  );
}

type FreeLog = Record<string, unknown> & { outcome: string; stage: string; attemptId: string; uaFlags: string[] };
function logsFrom(spy: { mock: { calls: unknown[][] } }): FreeLog[] {
  return spy.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.includes("freeAttempt"))
    .map((line) => JSON.parse(line).freeAttempt as FreeLog);
}

let store: InMemoryScannerReportStore;
let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("SCANNER_REPORT_TOKEN_SECRET", SECRET);
  store = new InMemoryScannerReportStore();
  setScannerReportStoreForTests(store);
  clearFreeLeadRateLimitForTests();
  headersMock.mockResolvedValue(
    new Headers({
      origin: "https://oppscan.e3d.ai",
      host: "oppscan.e3d.ai",
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "user-agent": FB_UA,
    }),
  );
  securityMocks.isTrustedServerActionOrigin.mockReturnValue(true);
  securityMocks.verifyTurnstileToken.mockResolvedValue(true);
  rateLimitMocks.isFreeAnalysisRateLimited.mockReturnValue(false);
  analysisMocks.generateFreeScannerCandidates.mockResolvedValue(rankScannerCandidates(candidates));
  deliveryMocks.deliverFreeLead.mockResolvedValue({ ok: true });
  spy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  spy.mockRestore();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  setScannerReportStoreForTests(undefined);
});

describe("free summary action: logging and signed token", () => {
  it("logs a succeeded line and returns a token that verifies to exactly the shown summary", async () => {
    const state = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      summaryForm(),
    );
    const verified = verifyFreeSummary(state.summaryToken!, SECRET)!;
    expect(verified.opportunities).toEqual(
      state.candidates!.map((c) => ({ title: c.title, summary: c.summary })),
    );
    expect(verified.websiteHost).toBe("redwoodfab.example.com");

    const [log] = logsFrom(spy);
    expect(log).toMatchObject({ stage: "summary", outcome: "succeeded", websiteHost: "redwoodfab.example.com" });
    expect(log.uaFlags).toEqual(expect.arrayContaining(["facebook_inapp", "mobile"]));
    const raw = spy.mock.calls.map(([line]: unknown[]) => String(line)).join("\n");
    expect(raw).not.toContain("203.0.113.9");
    expect(raw).not.toContain("/private/path");
  });

  it("issues no token when no signing secret is configured", async () => {
    vi.stubEnv("SCANNER_REPORT_TOKEN_SECRET", "");
    const state = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      summaryForm(),
    );
    expect(state.status).toBe("success");
    expect(state.summaryToken).toBeUndefined();
  });

  it("logs each early rejection and a generation failure", async () => {
    const run = () =>
      submitFreeScannerIntake({ status: "idle", values: emptyFreeScannerIntakeValues, errors: {} }, summaryForm());
    securityMocks.isTrustedServerActionOrigin.mockReturnValueOnce(false);
    await run();
    rateLimitMocks.isFreeAnalysisRateLimited.mockReturnValueOnce(true);
    await run();
    securityMocks.verifyTurnstileToken.mockResolvedValueOnce(false);
    await run();
    analysisMocks.generateFreeScannerCandidates.mockRejectedValueOnce(new Error("llm down"));
    await run();
    expect(logsFrom(spy).map((l) => l.outcome)).toEqual([
      "rejected_origin",
      "rejected_rate_limit",
      "rejected_turnstile",
      "failed",
    ]);
  });
});

describe("free lead capture action", () => {
  it("saves the lead, emails the summary that was signed (not client text), and logs success", async () => {
    const token = await getSummaryToken();
    const result = await capture({ email: " Owner@Example.com ", marketingOptIn: "on", summaryToken: token });
    expect(result.status).toBe("success");

    expect(deliveryMocks.deliverFreeLead).toHaveBeenCalledOnce();
    const delivered = deliveryMocks.deliverFreeLead.mock.calls[0][0];
    expect(delivered.email).toBe("Owner@Example.com".trim());
    expect(delivered.marketingOptIn).toBe(true);
    expect(delivered.websiteHost).toBe("redwoodfab.example.com");
    expect(delivered.opportunities.map((o: { title: string }) => o.title)).toEqual([
      "Opportunity 1",
      "Opportunity 2",
      "Opportunity 3",
    ]);

    const feed = await store.listFreeLeadSummariesAfter(null, 10);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ websiteHost: "redwoodfab.example.com", marketingOptIn: true, opportunityCount: 3, deliveryStatus: "sent" });

    const captureLog = logsFrom(spy).find((l) => l.stage === "lead_capture")!;
    expect(captureLog).toMatchObject({ outcome: "succeeded", emailProvided: true, marketingOptIn: true });
    const raw = spy.mock.calls.map(([line]: unknown[]) => String(line)).join("\n");
    expect(raw).not.toContain("owner@example.com".toLowerCase());
    expect(raw.toLowerCase()).not.toContain("owner@example.com");
    expect(raw).not.toContain("203.0.113.9");
  });

  it("does not email or save twice when the same person asks again", async () => {
    const token = await getSummaryToken();
    await capture({ email: "owner@example.com", summaryToken: token });
    const second = await capture({ email: "OWNER@example.com", summaryToken: token });
    expect(second.status).toBe("success");
    expect(deliveryMocks.deliverFreeLead).toHaveBeenCalledOnce();
    expect(await store.listFreeLeadSummariesAfter(null, 10)).toHaveLength(1);
    const reasons = logsFrom(spy).filter((l) => l.stage === "lead_capture").map((l) => l.reason);
    expect(reasons).toContain("already_captured");
  });

  it("rejects a missing, forged or expired summary token without saving or sending", async () => {
    for (const summaryToken of ["", "forged.token"]) {
      const result = await capture({ email: "owner@example.com", summaryToken });
      expect(result.status).toBe("error");
      expect(result.errors.form).toMatch(/expired/);
    }
    expect(deliveryMocks.deliverFreeLead).not.toHaveBeenCalled();
    expect(await store.listFreeLeadSummariesAfter(null, 10)).toHaveLength(0);
    expect(logsFrom(spy).filter((l) => l.stage === "lead_capture").map((l) => l.outcome)).toEqual([
      "rejected_summary_token",
      "rejected_summary_token",
    ]);
  });

  it("validates the email, the bot check, the honeypot and the rate limit", async () => {
    const token = await getSummaryToken();

    const badEmail = await capture({ email: "nope", summaryToken: token });
    expect(badEmail.errors.email).toBeTruthy();

    securityMocks.verifyTurnstileToken.mockResolvedValueOnce(false);
    expect((await capture({ email: "a@example.com", summaryToken: token })).errors.form).toMatch(/Bot protection/);

    const honeypot = await capture({ email: "bot@example.com", summaryToken: token, website: "spam" });
    expect(honeypot.status).toBe("success");

    expect(deliveryMocks.deliverFreeLead).not.toHaveBeenCalled();
    expect(await store.listFreeLeadSummariesAfter(null, 10)).toHaveLength(0);

    // The honeypot is checked before the rate limit, so only the first two
    // calls above used up attempts; one more reaches the limit of three.
    await capture({ email: "still-not-valid", summaryToken: token });

    // The next call from the same IP within the window is rate limited.
    const limited = await capture({ email: "c@example.com", summaryToken: token });
    expect(limited.status).toBe("error");
    expect(limited.errors.form).toMatch(/Too many/);
  });

  it("keeps the lead and still shows success when delivery fails, marking it failed", async () => {
    deliveryMocks.deliverFreeLead.mockResolvedValue({ ok: false, message: "ses down" });
    const token = await getSummaryToken();
    const result = await capture({ email: "owner@example.com", summaryToken: token });
    expect(result.status).toBe("success");
    const [lead] = await store.listFreeLeadSummariesAfter(null, 10);
    expect(lead.deliveryStatus).toBe("failed");
    const log = logsFrom(spy).find((l) => l.stage === "lead_capture")!;
    expect(log).toMatchObject({ outcome: "failed", reason: "delivery" });
  });

  it("rejects an untrusted origin", async () => {
    const token = await getSummaryToken();
    securityMocks.isTrustedServerActionOrigin.mockReturnValueOnce(false);
    const result = await capture({ email: "owner@example.com", summaryToken: token });
    expect(result.status).toBe("error");
    expect(deliveryMocks.deliverFreeLead).not.toHaveBeenCalled();
  });
});
