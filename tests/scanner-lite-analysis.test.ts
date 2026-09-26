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
    executiveSummary: "Short summary of the opportunity.",
    recommendedStartingPoint: "Start with dispatch automation.",
    opportunities: rankedIds.map((candidateId) => ({
      candidateId,
      headline: "Automate dispatch confirmations",
      whyItMatters: "Techs currently confirm jobs by phone, which is slow.",
      practicalApproach: ["Stand up a text confirmation flow.", "Pilot with one crew."],
      considerations: ["Requires a phone-number-verified sending number."],
    })),
    consultationPreparation: ["What CRM do you use today?", "How many trucks run daily?"],
    closingNote: "Book the free strategy call to go deeper.",
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
