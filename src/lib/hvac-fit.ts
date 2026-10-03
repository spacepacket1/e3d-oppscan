import { HVAC_PLATFORM_CAPABILITIES } from "@/lib/hvac-platform-capabilities";
import {
  emptyHvacDetectedStack,
  isHvacPlatform,
  type HvacDetectedStack,
  type HvacPlatform,
  type HvacToolChoice,
} from "@/lib/scanner-lite-stack";

// "Can we actually help this business?" -- an internal qualification
// signal, deliberately computed by plain rules rather than an LLM so it is
// predictable and reviewable. It is stored on the report and sent to the CRM
// webhook so a sales conversation starts informed; it is never shown to the
// prospect. The thresholds are a starting point to be tuned as real leads
// come in and as the platform capabilities table is verified.
export type HvacFitTier = "strong" | "possible" | "unlikely";

export type HvacFitAssessment = {
  tier: HvacFitTier;
  reasons: string[];
};

// Everything we learned about the business's software and how well it fits.
// Persisted on the completed report under `campaign.leadContext`.
export type HvacLeadContext = {
  toolsUsed: HvacToolChoice[];
  detected: HvacDetectedStack;
  primaryPlatform: HvacPlatform | null;
  fit: HvacFitAssessment;
};

type FitProfile = {
  companyName: string;
  industry: string;
  companyDescription: string;
};

const HVAC_RELEVANCE =
  /hvac|heating|cooling|air[\s-]?condition|furnace|\ba\/c\b|\bac\b|mechanical|refrigerat|ventilat/i;

// Signs of a large or franchised operation that likely has in-house tooling
// and procurement, where a lightweight pilot is a poorer match.
const ENTERPRISE_HINT =
  /franchis|nationwide|national\s+(provider|brand|network)|locations\s+(in|across)\s+\d+\s+states/i;

const TIER_RANK: Record<HvacFitTier, number> = { strong: 2, possible: 1, unlikely: 0 };

export function assessHvacFit(
  profile: FitProfile,
  toolsUsed: readonly HvacToolChoice[],
  detected: HvacDetectedStack = emptyHvacDetectedStack,
): HvacFitAssessment {
  const text = `${profile.companyName} ${profile.industry} ${profile.companyDescription}`;
  if (!HVAC_RELEVANCE.test(text)) {
    return {
      tier: "unlikely",
      reasons: ["The business does not appear to be an HVAC company."],
    };
  }

  const platforms = selfReportedPlatforms(toolsUsed);
  if (detected.platform && !platforms.includes(detected.platform)) {
    platforms.push(detected.platform);
  }

  let tier: HvacFitTier;
  const reasons: string[] = [];

  if (platforms.length > 0) {
    let best: HvacFitTier = "possible";
    for (const platform of platforms) {
      const capability = HVAC_PLATFORM_CAPABILITIES[platform];
      if (capability.integration === "open_oauth") {
        best = "strong";
        reasons.push(
          `${capability.label} offers an open developer platform, so integration is straightforward.`,
        );
      } else if (capability.integration === "plan_gated") {
        reasons.push(
          `${capability.label}'s full API is limited to its top plan; its built-in AI may cover the basics.`,
        );
      } else if (capability.integration === "customer_credentials") {
        reasons.push(
          `${capability.label} requires the customer to issue their own API credentials; integration is possible but gated.`,
        );
      } else {
        reasons.push(
          `${capability.label}'s integration options have not been verified yet.`,
        );
      }
    }
    tier = best;
  } else if (toolsUsed.includes("spreadsheets_paper")) {
    tier = "strong";
    reasons.push("No existing field-service system to integrate with or replace.");
  } else if (toolsUsed.includes("other")) {
    tier = "possible";
    reasons.push("Uses software we do not recognize; integration needs a closer look.");
  } else {
    tier = "possible";
    reasons.push("Software stack unknown; confirm it on the call.");
  }

  if (ENTERPRISE_HINT.test(profile.companyDescription) && TIER_RANK[tier] > TIER_RANK.possible) {
    tier = "possible";
    reasons.push("Appears to be a large or franchised operation that may have in-house tooling.");
  }

  return { tier, reasons };
}

export function buildHvacLeadContext(
  profile: FitProfile,
  toolsUsed: readonly HvacToolChoice[],
  detected: HvacDetectedStack,
): HvacLeadContext {
  const selfReported = toolsUsed.find(isHvacPlatform) ?? null;
  return {
    toolsUsed: [...toolsUsed],
    detected,
    primaryPlatform: selfReported ?? detected.platform,
    fit: assessHvacFit(profile, toolsUsed, detected),
  };
}

function selfReportedPlatforms(toolsUsed: readonly HvacToolChoice[]): HvacPlatform[] {
  return toolsUsed.filter(isHvacPlatform);
}
