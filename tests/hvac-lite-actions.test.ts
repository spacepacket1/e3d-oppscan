import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const securityMocks = vi.hoisted(() => ({
  isTrustedServerActionOrigin: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));
const rateLimitMocks = vi.hoisted(() => ({
  isHvacLiteRateLimited: vi.fn(),
}));
const analysisMocks = vi.hoisted(() => ({
  fetchHvacLiteCompanyProfile: vi.fn(),
  generateLiteScannerAnalysis: vi.fn(),
}));
const deliveryMocks = vi.hoisted(() => ({
  deliverScannerLiteSubmission: vi.fn(),
}));
const stackMocks = vi.hoisted(() => ({
  detectHvacStack: vi.fn(),
}));
const siteSignalsMocks = vi.hoisted(() => ({
  detectHvacSiteSignals: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));

vi.mock("@/lib/contact-security", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contact-security")>(
    "@/lib/contact-security",
  );
  return { ...actual, ...securityMocks };
});

vi.mock("@/lib/scanner-lite-rate-limit", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/scanner-lite-rate-limit")
  >("@/lib/scanner-lite-rate-limit");
  return { ...actual, ...rateLimitMocks };
});

vi.mock("@/lib/scanner-lite-analysis", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/scanner-lite-analysis")
  >("@/lib/scanner-lite-analysis");
  return { ...actual, ...analysisMocks };
});

vi.mock("@/lib/scanner-lite-delivery", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/scanner-lite-delivery")
  >("@/lib/scanner-lite-delivery");
  return { ...actual, ...deliveryMocks };
});

vi.mock("@/lib/scanner-lite-site-signals", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/scanner-lite-site-signals")
  >("@/lib/scanner-lite-site-signals");
  return { ...actual, ...siteSignalsMocks };
});

vi.mock("@/lib/scanner-lite-stack", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scanner-lite-stack")>(
    "@/lib/scanner-lite-stack",
  );
  return { ...actual, ...stackMocks };
});

import { emptyHvacDetectedStack } from "@/lib/scanner-lite-stack";
import { orchestrateHvacLiteIntake, submitHvacLiteIntake } from "../app/hvac/actions";
import { HvacLiteProfileError } from "@/lib/scanner-lite-analysis";
import { emptyHvacSiteSignals } from "@/lib/scanner-lite-site-signals";
import {
  emptyHvacLiteIntakeValues,
  type HvacLiteIntakeValues,
} from "@/lib/scanner-lite-intake";
import {
  InMemoryScannerReportStore,
  buildReportUrl,
  deriveLiteScanId,
  setScannerReportStoreForTests,
} from "@/lib/scanner-report-store";
import { rankScannerCandidates } from "@/lib/scanner-scoring";

const validValues: HvacLiteIntakeValues = {
  companyWebsite: "https://redwoodhvac.example.com",
  workEmail: "owner@redwoodhvac.example.com",
  marketingOptIn: true,
  toolsUsed: [],
  website: "",
  turnstileToken: "",
};

function buildFormData(overrides: Partial<HvacLiteIntakeValues> = {}) {
  const merged = { ...validValues, ...overrides };
  const formData = new FormData();
  formData.set("companyWebsite", merged.companyWebsite);
  formData.set("workEmail", merged.workEmail);
  if (merged.marketingOptIn) formData.set("marketingOptIn", "on");
  formData.set("website", merged.website);
  formData.set("turnstileToken", merged.turnstileToken);
  return formData;
}

const profile = {
  companyWebsite: "https://redwoodhvac.example.com",
  companyName: "Redwood HVAC",
  industry: "HVAC services",
  companyDescription: "Residential HVAC installation and repair.",
};

const candidates = Array.from({ length: 5 }, (_, index) => ({
  id: `candidate-${index + 1}`,
  title: `Candidate ${index + 1}`,
  summary: "A bounded opportunity.",
  outcomeType: "automation" as const,
  impact: 4,
  feasibility: 4,
  timeToValue: 3,
  confidence: 4,
  risk: 2,
  evidence: ["Evidence"],
  firstStep: "Start",
}));

function buildAnalysisResult() {
  return {
    candidates: rankScannerCandidates(candidates).slice(0, 4),
    report: {
      executiveSummary: "Summary",
      recommendedStartingPoint: "Start here",
      opportunities: rankScannerCandidates(candidates)
        .slice(0, 4)
        .map((candidate) => ({
          candidateId: candidate.id,
          headline: "Automate dispatch",
          whyItMatters: "Saves time",
          practicalApproach: ["Do step one", "Do step two"],
          considerations: ["Watch for X"],
        })),
      consultationPreparation: ["Question one", "Question two"],
      closingNote: "Book the call",
    },
    baseScore: 40,
    potentialScore: 70,
  };
}

describe("submitHvacLiteIntake", () => {
  beforeEach(() => {
    vi.stubEnv(
      "SCANNER_REPORT_TOKEN_SECRET",
      "test-scanner-report-token-secret-32-bytes",
    );
    setScannerReportStoreForTests(new InMemoryScannerReportStore());
    headersMock.mockResolvedValue(
      new Headers({ origin: "https://oppscan.e3d.ai", host: "oppscan.e3d.ai" }),
    );
    securityMocks.isTrustedServerActionOrigin.mockReturnValue(true);
    rateLimitMocks.isHvacLiteRateLimited.mockReturnValue(false);
    securityMocks.verifyTurnstileToken.mockResolvedValue(true);
    analysisMocks.fetchHvacLiteCompanyProfile.mockResolvedValue(profile);
    siteSignalsMocks.detectHvacSiteSignals.mockResolvedValue(emptyHvacSiteSignals);
    stackMocks.detectHvacStack.mockResolvedValue(emptyHvacDetectedStack);
    analysisMocks.generateLiteScannerAnalysis.mockResolvedValue(buildAnalysisResult());
    deliveryMocks.deliverScannerLiteSubmission.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe("attempt logging", () => {
    type AttemptLog = {
      outcome: string;
      reason?: string;
      websiteHost: string;
      emailProvided: boolean;
      userAgent: string;
      ipHash: string;
    };

    function attemptLogs(spy: { mock: { calls: unknown[][] } }): AttemptLog[] {
      return spy.mock.calls
        .map(([line]) => String(line))
        .filter((line: string) => line.includes("hvacLiteAttempt"))
        .map((line: string) => JSON.parse(line).hvacLiteAttempt as AttemptLog);
    }

    async function submit(overrides: Parameters<typeof buildFormData>[0] = {}) {
      return submitHvacLiteIntake(
        { status: "idle", values: emptyHvacLiteIntakeValues, errors: {} },
        buildFormData(overrides),
      );
    }

    beforeEach(() => {
      headersMock.mockResolvedValue(
        new Headers({
          origin: "https://oppscan.e3d.ai",
          host: "oppscan.e3d.ai",
          "x-forwarded-for": "203.0.113.9, 10.0.0.1",
          "user-agent": "TestBrowser/1.0",
        }),
      );
    });

    it("logs an outcome for each early rejection, with reasons", async () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      securityMocks.isTrustedServerActionOrigin.mockReturnValueOnce(false);
      await submit();
      await submit({ website: "filled-by-bot" });
      rateLimitMocks.isHvacLiteRateLimited.mockReturnValueOnce(true);
      await submit();
      await submit({ workEmail: "" });
      securityMocks.verifyTurnstileToken.mockResolvedValueOnce(false);
      await submit();

      const logs = attemptLogs(spy);
      expect(logs.map((entry) => entry.outcome)).toEqual([
        "rejected_origin",
        "rejected_honeypot",
        "rejected_rate_limit",
        "rejected_validation",
        "rejected_turnstile",
      ]);
      expect(logs[3].reason).toBe("workEmail");
      expect(logs[3].emailProvided).toBe(false);
      spy.mockRestore();
    });

    it("logs success, and never logs the email, the raw IP, or the full URL", async () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      await submit();

      const lines = spy.mock.calls.map(([line]) => String(line)).join("\n");
      const [entry] = attemptLogs(spy);
      expect(entry.outcome).toBe("succeeded");
      expect(entry.websiteHost).toBe("redwoodhvac.example.com");
      expect(entry.emailProvided).toBe(true);
      expect(entry.userAgent).toBe("TestBrowser/1.0");
      expect(entry.ipHash).toMatch(/^[0-9a-f]{12}$/);
      expect(lines).not.toContain("owner@redwoodhvac.example.com");
      expect(lines).not.toContain("203.0.113.9");
      expect(lines).not.toContain("https://redwoodhvac.example.com");
      spy.mockRestore();
    });

    it("logs a failed run with its error keys", async () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      analysisMocks.fetchHvacLiteCompanyProfile.mockRejectedValueOnce(
        new HvacLiteProfileError("upstream_rejected"),
      );
      const result = await submit();
      expect(result.status).toBe("error");
      const [entry] = attemptLogs(spy);
      expect(entry.outcome).toBe("failed");
      expect(entry.reason).toBe("companyWebsite");
      spy.mockRestore();
    });
  });

  it("rejects an untrusted origin without rate-limiting or generating", async () => {
    securityMocks.isTrustedServerActionOrigin.mockReturnValue(false);
    const result = await submitHvacLiteIntake(
      { status: "idle", values: emptyHvacLiteIntakeValues, errors: {} },
      buildFormData(),
    );
    expect(result.status).toBe("error");
    expect(result.errors.form).toMatch(/could not be verified/);
    expect(rateLimitMocks.isHvacLiteRateLimited).not.toHaveBeenCalled();
    expect(analysisMocks.fetchHvacLiteCompanyProfile).not.toHaveBeenCalled();
  });

  it("returns honeypot fake success without rate-limiting or generating", async () => {
    const result = await submitHvacLiteIntake(
      { status: "idle", values: emptyHvacLiteIntakeValues, errors: {} },
      buildFormData({ website: "filled-by-bot" }),
    );
    expect(result.status).toBe("success");
    expect(rateLimitMocks.isHvacLiteRateLimited).not.toHaveBeenCalled();
    expect(analysisMocks.fetchHvacLiteCompanyProfile).not.toHaveBeenCalled();
  });

  it("rejects when rate-limited without generating", async () => {
    rateLimitMocks.isHvacLiteRateLimited.mockReturnValue(true);
    const result = await submitHvacLiteIntake(
      { status: "idle", values: emptyHvacLiteIntakeValues, errors: {} },
      buildFormData(),
    );
    expect(result.status).toBe("error");
    expect(result.errors.form).toMatch(/Too many requests/);
    expect(analysisMocks.fetchHvacLiteCompanyProfile).not.toHaveBeenCalled();
  });

  it("rejects invalid values without checking turnstile", async () => {
    const result = await submitHvacLiteIntake(
      { status: "idle", values: emptyHvacLiteIntakeValues, errors: {} },
      buildFormData({ workEmail: "" }),
    );
    expect(result.status).toBe("error");
    expect(result.errors.workEmail).toBeTruthy();
    expect(securityMocks.verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("rejects a failed turnstile check without generating", async () => {
    securityMocks.verifyTurnstileToken.mockResolvedValue(false);
    const result = await submitHvacLiteIntake(
      { status: "idle", values: emptyHvacLiteIntakeValues, errors: {} },
      buildFormData(),
    );
    expect(result.status).toBe("error");
    expect(result.errors.form).toMatch(/Bot protection/);
    expect(analysisMocks.fetchHvacLiteCompanyProfile).not.toHaveBeenCalled();
  });

  it("succeeds end to end: analyzes, completes the report, and delivers the webhook", async () => {
    const result = await submitHvacLiteIntake(
      { status: "idle", values: emptyHvacLiteIntakeValues, errors: {} },
      buildFormData(),
    );
    expect(result.status).toBe("success");
    expect(analysisMocks.fetchHvacLiteCompanyProfile).toHaveBeenCalledOnce();
    expect(analysisMocks.generateLiteScannerAnalysis).toHaveBeenCalledOnce();
    expect(deliveryMocks.deliverScannerLiteSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Redwood HVAC",
        workEmail: "owner@redwoodhvac.example.com",
        marketingOptIn: true,
        campaign: "hvac_lite",
      }),
    );
  });
});

describe("orchestrateHvacLiteIntake", () => {
  beforeEach(() => {
    vi.stubEnv(
      "SCANNER_REPORT_TOKEN_SECRET",
      "test-scanner-report-token-secret-32-bytes",
    );
    analysisMocks.fetchHvacLiteCompanyProfile.mockResolvedValue(profile);
    siteSignalsMocks.detectHvacSiteSignals.mockResolvedValue(emptyHvacSiteSignals);
    stackMocks.detectHvacStack.mockResolvedValue(emptyHvacDetectedStack);
    analysisMocks.generateLiteScannerAnalysis.mockResolvedValue(buildAnalysisResult());
    deliveryMocks.deliverScannerLiteSubmission.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("tags the completed report with the hvac_lite campaign", async () => {
    const store = new InMemoryScannerReportStore();
    await orchestrateHvacLiteIntake(validValues, "1.1.1.1", { store });
    const scanId = deriveLiteScanId(validValues.workEmail, validValues.companyWebsite);
    const completed = await store.getByScanId(scanId);
    expect(completed?.campaign?.source).toBe("hvac_lite");
    expect(completed?.checkoutEmail).toBe(validValues.workEmail);
  });

  it("stores the stack and fit assessment, merging self-reported and detected tools", async () => {
    stackMocks.detectHvacStack.mockResolvedValue({
      platform: "housecall_pro",
      onlineBooking: true,
      chatWidget: false,
    });
    const store = new InMemoryScannerReportStore();
    await orchestrateHvacLiteIntake(
      { ...validValues, toolsUsed: ["jobber"] },
      "1.1.1.1",
      { store },
    );
    const scanId = deriveLiteScanId(validValues.workEmail, validValues.companyWebsite);
    const completed = await store.getByScanId(scanId);
    const context = completed?.campaign?.leadContext;
    expect(context?.primaryPlatform).toBe("jobber");
    expect(context?.detected.platform).toBe("housecall_pro");
    expect(context?.fit.tier).toBe("strong");
    expect(analysisMocks.generateLiteScannerAnalysis).toHaveBeenCalledWith(
      expect.any(String),
      profile,
      expect.objectContaining({ leadContext: context }),
    );
    expect(deliveryMocks.deliverScannerLiteSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ leadContext: context }),
    );
  });

  it("re-attempts delivery (without regenerating) when the report already exists", async () => {
    const store = new InMemoryScannerReportStore();
    await orchestrateHvacLiteIntake(validValues, "1.1.1.1", { store });
    expect(analysisMocks.generateLiteScannerAnalysis).toHaveBeenCalledOnce();

    const second = await orchestrateHvacLiteIntake(validValues, "1.1.1.1", { store });
    expect(second.status).toBe("success");
    expect(analysisMocks.generateLiteScannerAnalysis).toHaveBeenCalledOnce();
    expect(deliveryMocks.deliverScannerLiteSubmission).toHaveBeenCalledTimes(2);
  });

  it("returns a delivery error without discarding the already-completed report", async () => {
    const store = new InMemoryScannerReportStore();
    deliveryMocks.deliverScannerLiteSubmission.mockResolvedValueOnce({
      ok: false,
      message: "Scanner lite delivery failed. Please try again.",
    });

    const result = await orchestrateHvacLiteIntake(validValues, "1.1.1.1", { store });
    expect(result.status).toBe("error");
    expect(result.errors.form).toMatch(/delivery failed/);

    const scanId = deriveLiteScanId(validValues.workEmail, validValues.companyWebsite);
    expect(await store.getByScanId(scanId)).not.toBeNull();
  });

  it("returns a field-level error when site analysis fails", async () => {
    analysisMocks.fetchHvacLiteCompanyProfile.mockRejectedValue(
      new HvacLiteProfileError("upstream_rejected", "nope"),
    );
    const store = new InMemoryScannerReportStore();
    const result = await orchestrateHvacLiteIntake(validValues, "1.1.1.1", { store });
    expect(result.status).toBe("error");
    expect(result.errors.companyWebsite).toMatch(/couldn't analyze/);
    expect(deliveryMocks.deliverScannerLiteSubmission).not.toHaveBeenCalled();
  });

  it("releases the lease and returns a retryable error on a generic analysis failure", async () => {
    analysisMocks.generateLiteScannerAnalysis.mockRejectedValue(new Error("boom"));
    const store = new InMemoryScannerReportStore();
    const result = await orchestrateHvacLiteIntake(validValues, "1.1.1.1", { store });
    expect(result.status).toBe("error");
    expect(result.errors.form).toMatch(/could not be prepared/);

    const scanId = deriveLiteScanId(validValues.workEmail, validValues.companyWebsite);
    expect(
      await store.acquireGenerationLease(scanId, "next-owner", Date.now(), Date.now() + 10),
    ).toBe("acquired");
  });

  it("waits for a busy lease and then delivers the winner's report", async () => {
    const store = new InMemoryScannerReportStore();
    let releaseAnalysis!: (value: ReturnType<typeof buildAnalysisResult>) => void;
    analysisMocks.generateLiteScannerAnalysis.mockImplementationOnce(
      () => new Promise((resolve) => { releaseAnalysis = resolve; }),
    );

    const first = orchestrateHvacLiteIntake(validValues, "1.1.1.1", {
      store,
      leaseWaitMs: 200,
      pollIntervalMs: 1,
    });
    await vi.waitFor(() =>
      expect(analysisMocks.generateLiteScannerAnalysis).toHaveBeenCalledOnce(),
    );
    const second = orchestrateHvacLiteIntake(validValues, "1.1.1.1", {
      store,
      leaseWaitMs: 200,
      pollIntervalMs: 1,
    });
    releaseAnalysis(buildAnalysisResult());
    const [winner, waiter] = await Promise.all([first, second]);
    expect(winner.status).toBe("success");
    expect(waiter.status).toBe("success");
    expect(analysisMocks.generateLiteScannerAnalysis).toHaveBeenCalledOnce();
    expect(deliveryMocks.deliverScannerLiteSubmission).toHaveBeenCalledTimes(2);
  });

  it("builds an absolute report URL for the delivery webhook", async () => {
    const store = new InMemoryScannerReportStore();
    await orchestrateHvacLiteIntake(validValues, "1.1.1.1", { store });
    const scanId = deriveLiteScanId(validValues.workEmail, validValues.companyWebsite);
    const completed = await store.getByScanId(scanId);
    expect(deliveryMocks.deliverScannerLiteSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        reportUrl: expect.stringContaining(buildReportUrl(completed!.scanId)),
      }),
    );
    const [[call]] = deliveryMocks.deliverScannerLiteSubmission.mock.calls;
    expect(call.reportUrl).toMatch(/^https?:\/\//);
  });
});
