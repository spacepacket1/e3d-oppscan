import type { HvacPlatform } from "@/lib/scanner-lite-stack";

// What each field-service platform already gives an HVAC business natively,
// and how readily an outside party can integrate with it. This is a static,
// human-maintained table on purpose: the report must never describe a
// vendor's features from the model's memory, so the prompt may only cite the
// `nativeAi` strings below. Re-verify these before relying on them -- vendors
// change plans and features often.
//
// integration:
//   "open_oauth"            -- a developer platform where an admin authorizes
//                              an app via OAuth.
//   "plan_gated"            -- a public API exists but only on a top-tier plan.
//   "customer_credentials"  -- API exists; each customer must generate and
//                              share their own credentials (and may need a
//                              specific package).
//   "unverified"            -- not yet researched; treat as unknown.
export type PlatformIntegration =
  | "open_oauth"
  | "plan_gated"
  | "customer_credentials"
  | "unverified";

export type PlatformCapabilities = {
  label: string;
  nativeAi: string | null;
  integration: PlatformIntegration;
  verifiedOn: string;
};

export const HVAC_PLATFORM_CAPABILITIES: Record<HvacPlatform, PlatformCapabilities> = {
  servicetitan: {
    label: "ServiceTitan",
    nativeAi:
      "ServiceTitan's Atlas assistant, which can run reports, find jobs, and help with dispatch in plain English",
    integration: "customer_credentials",
    verifiedOn: "2026-10-03",
  },
  housecall_pro: {
    label: "Housecall Pro",
    nativeAi:
      "Housecall Pro's CSR AI, which answers calls and books jobs, plus its built-in marketing and accounting assistants",
    integration: "plan_gated",
    verifiedOn: "2026-10-03",
  },
  jobber: {
    label: "Jobber",
    nativeAi:
      "Jobber's Copilot assistant and its AI Receptionist add-on for answering calls and booking",
    integration: "open_oauth",
    verifiedOn: "2026-10-03",
  },
  fieldedge: {
    label: "FieldEdge",
    nativeAi: null,
    integration: "unverified",
    verifiedOn: "2026-10-03",
  },
  workiz: {
    label: "Workiz",
    nativeAi: null,
    integration: "unverified",
    verifiedOn: "2026-10-03",
  },
  service_fusion: {
    label: "Service Fusion",
    nativeAi: null,
    integration: "unverified",
    verifiedOn: "2026-10-03",
  },
};
