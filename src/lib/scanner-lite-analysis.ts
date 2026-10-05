import { SiteProfileError, fetchSiteProfileDraft } from "@/lib/scanner-site-profile";
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
  type HvacOpportunityConfidence,
  type HvacOpportunityEase,
  type HvacOpportunityFinancialLever,
  type HvacOpportunityImpact,
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
import { HVAC_PLATFORM_CAPABILITIES } from "@/lib/hvac-platform-capabilities";
import type { HvacLeadContext } from "@/lib/hvac-fit";
import { emptyHvacSiteSignals, type HvacSiteSignals } from "@/lib/scanner-lite-site-signals";

// HVAC Lite writes up exactly this many opportunities -- matches the partner's
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

// Site analysis itself lives in scanner-site-profile.ts (shared with the free
// summary). This wrapper keeps the HVAC Lite behaviour: the same error type and
// HVAC-flavoured fallbacks for any field the site did not yield.
export async function fetchHvacLiteCompanyProfile(
  website: string,
  { ipHash, fetchImpl = fetch }: { ipHash: string; fetchImpl?: typeof fetch },
): Promise<HvacLiteCompanyProfile> {
  let draft;
  try {
    draft = await fetchSiteProfileDraft(website, { ipHash, fetchImpl });
  } catch (error) {
    if (error instanceof SiteProfileError) {
      throw new HvacLiteProfileError(error.reason, error.message);
    }
    throw error;
  }

  return {
    companyWebsite: website,
    companyName: draft.companyName || website,
    industry: draft.industry || "HVAC services",
    companyDescription: draft.companyDescription || `An HVAC business at ${website}.`,
  };
}

// Biases candidate generation toward opportunity categories that are
// specific to how HVAC businesses actually operate and make money, rather
// than the generic-service-business patterns (intake, message drafting,
// routing) the shared CANDIDATE_SCHEMA_INSTRUCTIONS alone tends to produce.
// The categories deliberately line up with what FutCo actually sells
// on the follow-up call (per the partner's spec: comms/follow-up automation,
// reactivating old customer lists, review/reputation management, turning
// the website into a lead generator) so the free report sets up that pitch
// instead of wandering into unrelated ops territory. Only affects the HVAC
// Lite candidate call -- the paid and free tiers are untouched.
const HVAC_CANDIDATE_FOCUS_INSTRUCTIONS =
  "This scan is for a residential/commercial HVAC service business reached through an HVAC-targeted ad campaign. " +
  "Prioritize opportunities genuinely specific to how HVAC businesses operate and make money, grounded in the business's actual website content, drawing from categories such as: " +
  "maintenance-agreement or membership-plan renewal reminders and upsell automation; " +
  "seasonal proactive outreach timed to HVAC's demand cycle (spring cooling tune-ups, fall heating tune-ups); " +
  "AI-assisted quote and proposal generation for equipment replacement and installation jobs -- faster turnaround, multiple financing/efficiency tiers, more professional output -- to win more of that higher-ticket business; " +
  "presenting financing options at the point of quote for higher-ticket equipment replacement; " +
  "automated review and reputation management after completed jobs, since online reviews are a primary lead-generation channel for local HVAC businesses; " +
  "reactivating old customer or service-history lists into repeat maintenance or replacement leads; " +
  "and after-hours or emergency no-heat/no-cool request triage and routing. " +
  "Only include a category here if it is plausible for this specific business based on its website -- do not force every category into the list, and never fabricate a service, financing option, or program the business does not appear to offer. " +
  "A general office/administrative opportunity is acceptable when nothing more HVAC-specific plausibly applies, but should not crowd out the categories above when there is a plausible fit. " +
  "A <DETECTED_SITE_SIGNALS> block follows the intake JSON with best-effort true/false keyword detections from the business's homepage: installationOrReplacement, financingOffered, quoteOrEstimateCta, maintenancePlanOrMembership, emergencyOrSameDayService, brandNameMentioned, customerReviewsMentioned. Treat a true value as concrete evidence you may cite directly. Treat a false value only as inconclusive, never as proof the business lacks that offering -- detection can miss wording the site uses differently or a page that wasn't fetched. " +
  "One exception: quote and proposal generation for equipment replacement/installation is a near-universal offering for a full-service HVAC business, so include it as a plausible opportunity even when installationOrReplacement and quoteOrEstimateCta are both false, unless the website clearly signals a repair-only or maintenance-only business. Do not extend that same benefit of the doubt to the other categories (financing, membership/maintenance plans, etc.) -- those must still be grounded in the profile description or a true detected signal, since they vary meaningfully by business. " +
  "When several categories are plausible, favor this business priority order when rating impact and feasibility, since it reads best to an executive: (1) capturing and routing more incoming service requests faster, (2) following up on replacement/installation estimates and financing, (3) reducing proposal and administrative preparation time, (4) post-job customer communication and review generation. Review/reputation management is a real, worthwhile opportunity, but a weaker opening argument than the first three -- rate it accordingly rather than as the top opportunity when stronger categories are also plausible. " +
  "A <STACK_CONTEXT> block may follow with the business's field-service software (platform), tools the owner reported, whether online booking or a chat widget was detected, and platformNativeAi -- a fixed description of what that platform already does natively. When platformNativeAi is present, treat using that built-in capability as the first, simplest option for the matching opportunity (call answering, booking, reporting) and focus the remaining opportunities on gaps a single platform does not cover: estimate follow-up, reactivating old customers, cross-system follow-up, review requests. Never describe any vendor feature beyond what platformNativeAi states, and never assume software the block does not name. " +
  "When a review-related opportunity is plausible, never suggest selectively soliciting reviews only from satisfied customers or discouraging/filtering negative ones -- describe sending the same neutral review invitation to every eligible customer, with negative feedback separately routed to staff for private service recovery rather than withheld from the public review flow.";

// Rewritten per the partner's spec (2026-09-26 "Oppscan Lead Magnet" +
// 2026-09-29 "Full Spec chat" emails, discussed 2026-09-30): this report is
// meant to be a forwardable business case a dispatcher or ops lead can send
// to an owner/GM/budget holder, not an AI-capability writeup. Automation is
// the "how", never the headline "what" -- every field below is written to
// keep AI language out of the parts a reader actually sees, and the
// numeric 1-5 candidate ratings stay off screen entirely (they still drive
// ranking -- see rankScannerCandidates -- but the partner was explicit that
// "why is this a 400?" doesn't help the sale).
const LITE_REPORT_SCHEMA_INSTRUCTIONS =
  'Return one object containing exactly: "reportTitle", "preparedForNote", "whatWeObserved", "executiveSummary", "recommendedStartingPoint", "opportunities", "consultationPreparation", and "closingNote". ' +
  'Each opportunity must contain exactly: "candidateId", "headline", "whyItMatters", "financialLever", "potentialImpact", "confidence", "easeOfImplementation", "timeToValue", "recommendedPilot", "valueCalculation", "practicalApproach", and "considerations". ' +
  '"valueCalculation" must contain exactly "formula" and "dataNeeded". ' +
  "Return exactly one opportunity for each ranked candidate, in the supplied order, without changing IDs, scores, or ranks. " +
  "This report is a forwardable business case a dispatcher, marketing manager, or operations lead can send to an owner, GM, or budget holder -- not an AI-capability writeup. Automation and AI are how FutCo gets the result, never the thing being sold: frame every section around booked revenue, response speed, administrative capacity, and customer experience, and mention automation or AI only when explaining how a step works, never as the headline value. " +
  '"reportTitle" is a specific, forwardable headline naming the business and a business outcome, in the style of "Three Ways [Company Name] May Capture More Booked Work Without Increasing Ad Spend" -- never mention "AI", "scanner", or a numeric score in the title. ' +
  '"preparedForNote" is one short sentence stating this was prepared for the owner, general manager, operations leader, or marketing team based on publicly available business information. ' +
  '"whatWeObserved" must contain 3-5 short bullet facts drawn only from the business profile -- specific, publicly-grounded observations (services offered, locations, positioning, financing, contact channels), never a fabricated fact. ' +
  '"executiveSummary" must be readable in about 30 seconds and cover, within 1-2 short paragraphs: what was observed about the business, where it may be losing revenue, time, or customer goodwill, which opportunity below appears most valuable, and what the business should do next. Ground every claim in the business profile; never state a specific dollar figure as fact. ' +
  "headline must be a short, business-outcome title only (under 100 characters) -- never restate rank, scores, or the word AI in the headline. " +
  "whyItMatters should be 2-4 sentences of concrete reasoning grounded in the business's actual services or website content, framed around the business outcome (faster response, more booked work, less admin time), not a generic automation-capability description. " +
  '"financialLever" is exactly one of "revenue", "cost-savings", "capacity", or "customer-experience" -- the primary way this opportunity creates value. ' +
  '"potentialImpact" is exactly one of "high", "medium", or "moderate", judged from how directly this lever connects to booked revenue or hard cost, given this business\'s apparent scale. ' +
  '"confidence" is exactly one of "strong-evidence", "moderate-evidence", or "limited-evidence", reflecting how directly the business profile supports this opportunity -- never inflate confidence beyond what the profile actually shows. ' +
  '"easeOfImplementation" is exactly one of "straightforward", "moderate", or "involved". ' +
  '"timeToValue" is a short phrase (under 40 characters) estimating how soon a pilot could show a measurable result, e.g. "2-4 weeks". ' +
  '"recommendedPilot" is one short sentence describing a small, testable first pilot for this opportunity. ' +
  '"valueCalculation.formula" is one short line showing the calculation shape for estimating this opportunity\'s value from the business\'s own numbers, e.g. "Unanswered or delayed inquiries per month x incremental booking rate x average gross profit per job" -- a formula only, never a computed dollar amount, since none of the inputs are knowable from a public website. ' +
  '"valueCalculation.dataNeeded" must contain 2-5 short items naming the specific internal numbers the business would need to supply to run that formula (e.g. "Monthly service inquiries", "Current booking rate", "Average gross profit per job"). ' +
  '"practicalApproach" must be an array of 2-4 short, sequential, concrete action steps. ' +
  "considerations must contain 1-3 specific, non-obvious risks or dependencies. When the opportunity involves customer reviews, never suggest selectively soliciting only satisfied customers or discouraging negative reviews -- the same neutral review invitation should go to every eligible customer, with negative feedback separately routed to staff for service recovery, not withheld from the public review flow. " +
  '"recommendedStartingPoint" is 2-3 sentences naming the single best first step. When a <STACK_CONTEXT> block includes platformNativeAi, name that built-in capability as the first thing to evaluate and describe the specific gap that would remain; never state a vendor feature that platformNativeAi does not contain. ' +
  '"consultationPreparation" must contain 3-5 short items naming the operating numbers (e.g. monthly inquiry volume, missed-call count, unsold estimate count, average job value) the reader should bring to a 20-minute call to validate whether an opportunity below is financially material -- frame it as a quick numbers-based validation call, not a generic strategy session or a paid engagement. ' +
  '"closingNote" is 1-3 sentences inviting the reader to validate the opportunity on that 20-minute call. ' +
  "Never invent specific facts (revenue, employee count, named customers, a computed dollar figure) that are not shown or clearly implied on the website; when uncertain, stay general rather than fabricate.";

function buildLiteUntrustedIntakeEnvelope(profile: HvacLiteCompanyProfile) {
  const serialized = escapeIntakeJsonForEnvelope(JSON.stringify(profile));
  return `<UNTRUSTED_INTAKE_JSON>\n${serialized}\n</UNTRUSTED_INTAKE_JSON>`;
}

// Unlike the envelope above, this is safe to serialize without the
// delimiter-escaping treatment: every value here is a boolean this code
// computed itself (see scanner-lite-site-signals.ts), not attacker-supplied
// freeform text, so there is no string content that could ever contain a
// closing tag to break out with.
// Every value here is an enum, boolean, or a static string authored in
// hvac-platform-capabilities.ts -- never scraped or user-typed text -- so,
// like the signals block, it needs no delimiter escaping.
function buildStackContextBlock(context: HvacLeadContext | undefined) {
  if (!context) return "";
  const platform = context.primaryPlatform;
  const body = {
    platform,
    toolsReportedByOwner: context.toolsUsed,
    onlineBookingDetected: context.detected.onlineBooking,
    chatWidgetDetected: context.detected.chatWidget,
    platformNativeAi: platform
      ? HVAC_PLATFORM_CAPABILITIES[platform].nativeAi
      : null,
  };
  return `\n<STACK_CONTEXT>\n${JSON.stringify(body)}\n</STACK_CONTEXT>`;
}

function buildSiteSignalsBlock(signals: HvacSiteSignals) {
  return `<DETECTED_SITE_SIGNALS>\n${JSON.stringify(signals)}\n</DETECTED_SITE_SIGNALS>`;
}

const FINANCIAL_LEVERS: readonly HvacOpportunityFinancialLever[] = [
  "revenue",
  "cost-savings",
  "capacity",
  "customer-experience",
];
const IMPACT_LEVELS: readonly HvacOpportunityImpact[] = ["high", "medium", "moderate"];
const CONFIDENCE_LEVELS: readonly HvacOpportunityConfidence[] = [
  "strong-evidence",
  "moderate-evidence",
  "limited-evidence",
];
const EASE_LEVELS: readonly HvacOpportunityEase[] = ["straightforward", "moderate", "involved"];

function oneOf<Value extends string>(value: unknown, allowed: readonly Value[]): Value {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value))
    throw new ScannerAnalysisError("llm_schema");
  return value as Value;
}

function validateValueCalculation(value: unknown) {
  assertExactObject(value, ["formula", "dataNeeded"]);
  return {
    formula: boundedString(value.formula, 300),
    dataNeeded: boundedStringArray(value.dataNeeded, 2, 5, 120),
  };
}

function validateLiteReportResponse(
  value: unknown,
  ranked: readonly RankedScannerCandidate[],
): ScannerReportCopy {
  assertExactObject(value, [
    "reportTitle",
    "preparedForNote",
    "whatWeObserved",
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
        "financialLever",
        "potentialImpact",
        "confidence",
        "easeOfImplementation",
        "timeToValue",
        "recommendedPilot",
        "valueCalculation",
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
        financialLever: oneOf(entry.financialLever, FINANCIAL_LEVERS),
        potentialImpact: oneOf(entry.potentialImpact, IMPACT_LEVELS),
        confidence: oneOf(entry.confidence, CONFIDENCE_LEVELS),
        easeOfImplementation: oneOf(entry.easeOfImplementation, EASE_LEVELS),
        timeToValue: boundedString(entry.timeToValue, 40),
        recommendedPilot: boundedString(entry.recommendedPilot, 240),
        valueCalculation: validateValueCalculation(entry.valueCalculation),
        practicalApproach: boundedStringArray(entry.practicalApproach, 2, 4, 250),
        considerations: boundedStringArray(entry.considerations, 1, 3, 400),
      };
    },
  );

  return {
    reportTitle: boundedString(value.reportTitle, 160),
    preparedForNote: boundedString(value.preparedForNote, 200),
    whatWeObserved: boundedStringArray(value.whatWeObserved, 3, 5, 200),
    executiveSummary: boundedString(value.executiveSummary, 1600),
    recommendedStartingPoint: boundedString(value.recommendedStartingPoint, 800),
    opportunities,
    consultationPreparation: boundedStringArray(
      value.consultationPreparation,
      3,
      5,
      300,
    ),
    closingNote: boundedString(value.closingNote, 500),
  };
}

export async function generateLiteScannerAnalysis(
  scanId: string,
  profile: HvacLiteCompanyProfile,
  options: {
    transport?: ScannerLlmTransport;
    timeoutMs?: number;
    signals?: HvacSiteSignals;
    leadContext?: HvacLeadContext;
  } = {},
): Promise<ScannerAnalysisResult> {
  const transport = options.transport ?? createScannerLlmTransport();
  const timeoutMs = options.timeoutMs ?? getLlmTimeoutMs();
  const envelope = buildLiteUntrustedIntakeEnvelope(profile);
  const signalsBlock = buildSiteSignalsBlock(options.signals ?? emptyHvacSiteSignals);
  const stackBlock = buildStackContextBlock(options.leadContext);

  const candidatesText = await callWithTimeout(
    transport,
    {
      model: getModel(),
      messages: [
        {
          role: "system",
          content: `${PROMPT_SAFETY} ${CANDIDATE_SCHEMA_INSTRUCTIONS} ${HVAC_CANDIDATE_FOCUS_INSTRUCTIONS}`,
        },
        {
          role: "user",
          content: `${envelope}\n${signalsBlock}${stackBlock}\nGenerate the candidate JSON now.`,
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
          content: `${envelope}${stackBlock}\n<APPLICATION_RANKED_CANDIDATES>\n${rankedContext}\n</APPLICATION_RANKED_CANDIDATES>\nWrite the report copy JSON now.`,
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
