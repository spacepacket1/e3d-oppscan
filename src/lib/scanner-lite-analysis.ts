import { getE3dApiBaseUrl } from "@/lib/scanner-payments";
import {
  CANDIDATE_SCHEMA_INSTRUCTIONS,
  PROMPT_SAFETY,
  ScannerAnalysisError,
  assertExactObject,
  boundedString,
  boundedStringArray,
  callWithTimeout,
  createScannerLlmTransport,
  escapeIntakeJsonForEnvelope,
  getLlmTimeoutMs,
  getModel,
  parseModelJson,
  validateCandidateResponse,
  type ScannerAnalysisResult,
  type ScannerLlmTransport,
  type ScannerReportCopy,
} from "@/lib/scanner-analysis";
import {
  computeBaseScore,
  computePotentialScore,
  rankScannerCandidates,
  type RankedScannerCandidate,
} from "@/lib/scanner-scoring";

// HVAC Lite writes up exactly this many opportunities -- matches Chapple's
// "at least four practical opportunities" spec and keeps the emailed report
// short and skimmable rather than the paid report's 5-10.
export const LITE_OPPORTUNITY_COUNT = 4;

export type HvacLiteCompanyProfile = {
  companyWebsite: string;
  companyName: string;
  industry: string;
  companyDescription: string;
};

export type HvacLiteProfileFailureReason =
  | "not_configured"
  | "network_error"
  | "upstream_rejected"
  | "empty_profile";

export class HvacLiteProfileError extends Error {
  constructor(
    readonly reason: HvacLiteProfileFailureReason,
    message = "Site analysis failed.",
  ) {
    super(message);
    this.name = "HvacLiteProfileError";
  }
}

// Reuses the same upstream e3d.ai endpoint the free/paid "Analyze my site"
// prefill buttons call (see app/api/free-intake/prefill/route.ts), but
// called directly server-side since Lite has no interactive prefill step --
// the site review happens automatically on submit, not behind a button.
export async function fetchHvacLiteCompanyProfile(
  website: string,
  { ipHash, fetchImpl = fetch }: { ipHash: string; fetchImpl?: typeof fetch },
): Promise<HvacLiteCompanyProfile> {
  const internalServiceKey =
    process.env.E3D_SCANNER_INTERNAL_SERVICE_KEY?.trim() || "";
  if (!internalServiceKey) {
    throw new HvacLiteProfileError(
      "not_configured",
      "Site analysis is not configured.",
    );
  }

  const endpointUrl = `${getE3dApiBaseUrl()}/payments/scanner/intake-prefill-free`;
  let response: Response;
  try {
    response = await fetchImpl(endpointUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        authorization: `Internal ${internalServiceKey}`,
      },
      body: JSON.stringify({ website, ipHash }),
    });
  } catch {
    throw new HvacLiteProfileError(
      "network_error",
      "Could not reach the site analysis service.",
    );
  }

  let payload: { ok?: boolean; draft?: Record<string, string | null> } | null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new HvacLiteProfileError(
      "upstream_rejected",
      "That website could not be analyzed.",
    );
  }

  const draft = payload.draft || {};
  const companyName = readDraftField(draft, "companyName");
  const industry = readDraftField(draft, "industry");
  const companyDescription = readDraftField(draft, "companyDescription");

  if (!companyName && !industry && !companyDescription) {
    throw new HvacLiteProfileError(
      "empty_profile",
      "That website did not return enough information to analyze.",
    );
  }

  return {
    companyWebsite: website,
    companyName: companyName || website,
    industry: industry || "HVAC services",
    companyDescription: companyDescription || `An HVAC business at ${website}.`,
  };
}

function readDraftField(
  draft: Record<string, string | null>,
  key: string,
) {
  const value = draft[key];
  return typeof value === "string" ? value.trim() : "";
}

const LITE_REPORT_SCHEMA_INSTRUCTIONS =
  'Return one object containing exactly: "executiveSummary", "recommendedStartingPoint", "opportunities", "consultationPreparation", and "closingNote". ' +
  'Each opportunity must contain exactly: "candidateId", "headline", "whyItMatters", "practicalApproach", and "considerations". ' +
  "Return exactly one opportunity for each ranked candidate, in the supplied order, without changing IDs, scores, or ranks. " +
  "This is a free, short teaser report generated automatically from the business's public website alone (no interview), meant to earn a follow-up call -- not the paid, in-depth advisory report. Keep it concise and skimmable: " +
  "executiveSummary should be 1-2 short paragraphs on the business's overall AI opportunity, grounded only in what the website itself shows or reasonably implies. " +
  "whyItMatters should be 2-4 sentences of concrete reasoning grounded in the business's actual services or website content, not generic advice. " +
  '"practicalApproach" must be an array of 2-4 short, sequential, concrete action steps. ' +
  "considerations must contain 1-3 specific, non-obvious risks or dependencies. " +
  '"consultationPreparation" must contain 2-4 short questions the reader could bring to the complimentary 30-minute AI Opportunity & Strategy Review call -- frame it as a free strategy call, not a paid engagement. ' +
  '"closingNote" is 1-3 sentences inviting the reader to book that complimentary call. ' +
  "headline must be a short, benefit-focused title only (under 100 characters) -- the application already displays rank and numeric ratings separately, so do not restate rank, scores, or ratings inside headline. " +
  "Never invent specific facts (revenue, employee count, named customers) that are not shown or clearly implied on the website; when uncertain, stay general rather than fabricate.";

function buildLiteUntrustedIntakeEnvelope(profile: HvacLiteCompanyProfile) {
  const serialized = escapeIntakeJsonForEnvelope(JSON.stringify(profile));
  return `<UNTRUSTED_INTAKE_JSON>\n${serialized}\n</UNTRUSTED_INTAKE_JSON>`;
}

function validateLiteReportResponse(
  value: unknown,
  ranked: readonly RankedScannerCandidate[],
): ScannerReportCopy {
  assertExactObject(value, [
    "executiveSummary",
    "recommendedStartingPoint",
    "opportunities",
    "consultationPreparation",
    "closingNote",
  ]);
  if (
    !Array.isArray(value.opportunities) ||
    value.opportunities.length !== ranked.length
  )
    throw new ScannerAnalysisError("llm_schema");

  const opportunities = value.opportunities.map(
    (entry: unknown, index: number) => {
      assertExactObject(entry, [
        "candidateId",
        "headline",
        "whyItMatters",
        "practicalApproach",
        "considerations",
      ]);
      const candidateId = boundedString(entry.candidateId, 64);
      if (candidateId !== ranked[index]?.id)
        throw new ScannerAnalysisError("llm_schema");
      return {
        candidateId,
        headline: boundedString(entry.headline, 140),
        whyItMatters: boundedString(entry.whyItMatters, 800),
        practicalApproach: boundedStringArray(entry.practicalApproach, 2, 4, 250),
        considerations: boundedStringArray(entry.considerations, 1, 3, 400),
      };
    },
  );

  return {
    executiveSummary: boundedString(value.executiveSummary, 1600),
    recommendedStartingPoint: boundedString(value.recommendedStartingPoint, 800),
    opportunities,
    consultationPreparation: boundedStringArray(
      value.consultationPreparation,
      2,
      4,
      300,
    ),
    closingNote: boundedString(value.closingNote, 500),
  };
}

export async function generateLiteScannerAnalysis(
  scanId: string,
  profile: HvacLiteCompanyProfile,
  options: { transport?: ScannerLlmTransport; timeoutMs?: number } = {},
): Promise<ScannerAnalysisResult> {
  const transport = options.transport ?? createScannerLlmTransport();
  const timeoutMs = options.timeoutMs ?? getLlmTimeoutMs();
  const envelope = buildLiteUntrustedIntakeEnvelope(profile);

  const candidatesText = await callWithTimeout(
    transport,
    {
      model: getModel(),
      messages: [
        {
          role: "system",
          content: `${PROMPT_SAFETY} ${CANDIDATE_SCHEMA_INSTRUCTIONS}`,
        },
        {
          role: "user",
          content: `${envelope}\nGenerate the candidate JSON now.`,
        },
      ],
    },
    timeoutMs,
    { scanId, call: "lite-candidates" },
  );
  const { candidates, maturity } = validateCandidateResponse(
    parseModelJson(candidatesText),
  );
  const ranked = rankScannerCandidates(candidates).slice(0, LITE_OPPORTUNITY_COUNT);
  const baseScore = computeBaseScore(maturity);
  const potentialScore = computePotentialScore(baseScore, ranked);
  const rankedContext = JSON.stringify({ ranked, baseScore, potentialScore });

  const reportText = await callWithTimeout(
    transport,
    {
      model: getModel(),
      messages: [
        {
          role: "system",
          content: `${PROMPT_SAFETY} ${LITE_REPORT_SCHEMA_INSTRUCTIONS}`,
        },
        {
          role: "user",
          content: `${envelope}\n<APPLICATION_RANKED_CANDIDATES>\n${rankedContext}\n</APPLICATION_RANKED_CANDIDATES>\nWrite the report copy JSON now.`,
        },
      ],
    },
    timeoutMs,
    { scanId, call: "lite-report" },
  );

  return {
    candidates: ranked,
    report: validateLiteReportResponse(parseModelJson(reportText), ranked),
    baseScore,
    potentialScore,
  };
}
