import { afterEach, describe, expect, it, vi } from "vitest";

import { ScannerAnalysisError } from "@/lib/scanner-analysis";
import {
  LITE_OPPORTUNITY_COUNT,
  fetchHvacLiteCompanyProfile,
  generateLiteScannerAnalysis,
} from "@/lib/scanner-lite-analysis";
import { rankScannerCandidates } from "@/lib/scanner-scoring";
import { emptyHvacSiteSignals } from "@/lib/scanner-lite-site-signals";

const validMaturity = {
  toolAdoption: 3,
  processIntegration: 3,
  dataReadiness: 3,
  technicalCapacity: 3,
  governance: 3,
};

const candidates = Array.from({ length: 6 }, (_, index) => ({
  id: `candidate-${index + 1}`,
  title: `Candidate ${index + 1}`,
  summary: "A bounded opportunity.",
  outcomeType: "automation" as const,
  impact: index === 0 ? 5 : 3,
  feasibility: 4,
  timeToValue: 3,
  confidence: 4,
  risk: 2,
  evidence: ["The site describes repeated dispatch work."],
  firstStep: "Confirm a workflow owner.",
}));

const profile = {
  companyWebsite: "https://redwoodhvac.example.com",
  companyName: "Redwood HVAC",
  industry: "HVAC services",
  companyDescription: "Residential HVAC installation and repair.",
};

function liteReportFor(rankedIds: string[]) {
  return {
    reportTitle: "Three Ways Redwood HVAC May Capture More Booked Work",
    preparedForNote:
      "Prepared for the owner, general manager, or operations leader based on publicly available business information.",
    whatWeObserved: [
      "Offers residential HVAC installation and repair.",
      "Positions itself around fast dispatch response.",
      "Serves the Redwood service area.",
    ],
    executiveSummary: "Short summary of the opportunity.",
    recommendedStartingPoint: "Start with dispatch automation.",
    opportunities: rankedIds.map((candidateId) => ({
      candidateId,
      headline: "Capture more booked dispatch work",
      whyItMatters: "Techs currently confirm jobs by phone, which is slow.",
      financialLever: "revenue" as const,
      potentialImpact: "high" as const,
      confidence: "moderate-evidence" as const,
      easeOfImplementation: "straightforward" as const,
      timeToValue: "2-4 weeks",
      recommendedPilot: "Pilot a text confirmation flow with one crew for 30 days.",
      valueCalculation: {
        formula: "Unanswered inquiries per month x booking rate x gross profit per job",
        dataNeeded: ["Monthly inquiries", "Current booking rate", "Average gross profit per job"],
      },
      practicalApproach: ["Stand up a text confirmation flow.", "Pilot with one crew."],
      considerations: ["Requires a phone-number-verified sending number."],
    })),
    consultationPreparation: [
      "Approximate monthly inquiry volume",
      "Missed-call count",
      "Average job value",
    ],
    closingNote: "Validate the opportunity on a quick 20-minute call.",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fetchHvacLiteCompanyProfile", () => {
  it("fails closed when the internal service key is not configured", async () => {
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "");
    await expect(
      fetchHvacLiteCompanyProfile("https://redwoodhvac.example.com", {
        ipHash: "hash",
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ reason: "not_configured" });
  });

  it("wraps a network failure", async () => {
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "internal-key");
    await expect(
      fetchHvacLiteCompanyProfile("https://redwoodhvac.example.com", {
        ipHash: "hash",
        fetchImpl: vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ reason: "network_error" });
  });

  it("rejects when the upstream response is not ok", async () => {
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "internal-key");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false }),
    });
    await expect(
      fetchHvacLiteCompanyProfile("https://redwoodhvac.example.com", {
        ipHash: "hash",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ reason: "upstream_rejected" });
  });

  it("rejects when the draft has no usable fields", async () => {
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "internal-key");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, draft: {} }),
    });
    await expect(
      fetchHvacLiteCompanyProfile("https://redwoodhvac.example.com", {
        ipHash: "hash",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ reason: "empty_profile" });
  });

  it("returns the drafted profile, falling back only per-field", async () => {
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "internal-key");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        draft: { companyName: "Redwood HVAC", industry: null, companyDescription: "  " },
      }),
    });
    const result = await fetchHvacLiteCompanyProfile("https://redwoodhvac.example.com", {
      ipHash: "hash",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.companyName).toBe("Redwood HVAC");
    expect(result.industry).toBe("HVAC services");
    expect(result.companyDescription).toContain("redwoodhvac.example.com");
  });
});

describe("generateLiteScannerAnalysis", () => {
  it("writes up exactly the top LITE_OPPORTUNITY_COUNT ranked candidates", async () => {
    const ranked = rankScannerCandidates(candidates).slice(0, LITE_OPPORTUNITY_COUNT);
    const requests: Array<{ messages: Array<{ content: string }> }> = [];
    const contexts: Array<{ call: string } | undefined> = [];

    const result = await generateLiteScannerAnalysis("scan_lite_test", profile, {
      transport: async (request, _signal, context) => {
        requests.push(request);
        contexts.push(context);
        return requests.length === 1
          ? JSON.stringify({ candidates, maturity: validMaturity })
          : JSON.stringify(liteReportFor(ranked.map((candidate) => candidate.id)));
      },
      timeoutMs: 100,
    });

    expect(result.candidates).toHaveLength(LITE_OPPORTUNITY_COUNT);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(
      ranked.map((candidate) => candidate.id),
    );
    expect(result.report.opportunities).toHaveLength(LITE_OPPORTUNITY_COUNT);
    expect(contexts.map((context) => context?.call)).toEqual([
      "lite-candidates",
      "lite-report",
    ]);
    const candidateSystemPrompt = requests[0].messages[0].content;
    expect(candidateSystemPrompt).toContain("quote and proposal generation");
    expect(candidateSystemPrompt).toContain("maintenance-agreement or membership-plan renewal");
    expect(candidateSystemPrompt).toContain("HVAC-targeted ad campaign");
    expect(candidateSystemPrompt).toContain("DETECTED_SITE_SIGNALS");
    expect(candidateSystemPrompt).toContain("near-universal offering for a full-service HVAC business");

    // No signals were passed, so the candidate call's user message carries
    // an all-false block rather than omitting it.
    const candidateUserMessage = requests[0].messages[1].content;
    expect(candidateUserMessage).toContain("<DETECTED_SITE_SIGNALS>");
    expect(candidateUserMessage).toContain('"financingOffered":false');
  });

  it("passes detected site signals through to the candidate call", async () => {
    const ranked = rankScannerCandidates(candidates).slice(0, LITE_OPPORTUNITY_COUNT);
    const requests: Array<{ messages: Array<{ content: string }> }> = [];

    await generateLiteScannerAnalysis("scan_lite_signals", profile, {
      transport: async (request) => {
        requests.push(request);
        return requests.length === 1
          ? JSON.stringify({ candidates, maturity: validMaturity })
          : JSON.stringify(liteReportFor(ranked.map((candidate) => candidate.id)));
      },
      timeoutMs: 100,
      signals: {
        ...emptyHvacSiteSignals,
        financingOffered: true,
        quoteOrEstimateCta: true,
      },
    });

    const candidateUserMessage = requests[0].messages[1].content;
    expect(candidateUserMessage).toContain('"financingOffered":true');
    expect(candidateUserMessage).toContain('"quoteOrEstimateCta":true');
    expect(candidateUserMessage).toContain('"maintenancePlanOrMembership":false');
  });

  it("passes the stack context to both calls, citing only the static native-AI text", async () => {
    const ranked = rankScannerCandidates(candidates).slice(0, LITE_OPPORTUNITY_COUNT);
    const requests: Array<{ messages: Array<{ content: string }> }> = [];

    await generateLiteScannerAnalysis("scan_lite_stack", profile, {
      transport: async (request) => {
        requests.push(request);
        return requests.length === 1
          ? JSON.stringify({ candidates, maturity: validMaturity })
          : JSON.stringify(liteReportFor(ranked.map((candidate) => candidate.id)));
      },
      timeoutMs: 100,
      leadContext: {
        toolsUsed: ["jobber"],
        detected: { platform: null, onlineBooking: true, chatWidget: false },
        primaryPlatform: "jobber",
        fit: { tier: "strong", reasons: ["x"] },
      },
    });

    for (const request of requests) {
      const user = request.messages[1].content;
      expect(user).toContain("<STACK_CONTEXT>");
      expect(user).toContain('"platform":"jobber"');
      expect(user).toContain("Jobber's Copilot assistant");
      // Fit is internal-only and must never reach the model.
      expect(user).not.toContain("strong");
    }
    expect(requests[1].messages[0].content).toContain("FutCo gets the result");
    expect(requests[1].messages[0].content).not.toContain("IteraWorks");
  });

  it("omits the stack block when no lead context is supplied", async () => {
    const ranked = rankScannerCandidates(candidates).slice(0, LITE_OPPORTUNITY_COUNT);
    const requests: Array<{ messages: Array<{ content: string }> }> = [];
    await generateLiteScannerAnalysis("scan_lite_nostack", profile, {
      transport: async (request) => {
        requests.push(request);
        return requests.length === 1
          ? JSON.stringify({ candidates, maturity: validMaturity })
          : JSON.stringify(liteReportFor(ranked.map((candidate) => candidate.id)));
      },
      timeoutMs: 100,
    });
    expect(requests[0].messages[1].content).not.toContain("<STACK_CONTEXT>");
  });

  it("rejects a report with the wrong opportunity count", async () => {
    const ranked = rankScannerCandidates(candidates).slice(0, LITE_OPPORTUNITY_COUNT);
    await expect(
      generateLiteScannerAnalysis("scan_lite_bad", profile, {
        transport: async (_request, _signal, context) =>
          context?.call === "lite-candidates"
            ? JSON.stringify({ candidates, maturity: validMaturity })
            : JSON.stringify(liteReportFor(ranked.slice(0, 3).map((candidate) => candidate.id))),
        timeoutMs: 100,
      }),
    ).rejects.toBeInstanceOf(ScannerAnalysisError);
  });

  it("rejects a report referencing a candidate outside the ranked set", async () => {
    const ranked = rankScannerCandidates(candidates).slice(0, LITE_OPPORTUNITY_COUNT);
    const badIds = [...ranked.slice(1).map((candidate) => candidate.id), "unknown-id"];
    await expect(
      generateLiteScannerAnalysis("scan_lite_bad_id", profile, {
        transport: async (_request, _signal, context) =>
          context?.call === "lite-candidates"
            ? JSON.stringify({ candidates, maturity: validMaturity })
            : JSON.stringify(liteReportFor(badIds)),
        timeoutMs: 100,
      }),
    ).rejects.toBeInstanceOf(ScannerAnalysisError);
  });
});
