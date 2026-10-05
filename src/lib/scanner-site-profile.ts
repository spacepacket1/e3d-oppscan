import { getE3dApiBaseUrl } from "@/lib/scanner-payments";

// Reads a business's public website and drafts three descriptive fields from
// it (name, industry, description) through the shared e3d.ai site-analysis
// endpoint. Used server-side by both the HVAC Lite flow and the free summary,
// so a visitor only has to give a website address. Unlike the HVAC wrapper in
// scanner-lite-analysis.ts, nothing here assumes a trade: missing fields come
// back empty and the caller decides what to do about them.
export type SiteProfileDraft = {
  companyName: string;
  industry: string;
  companyDescription: string;
};

export type SiteProfileFailureReason =
  | "not_configured"
  | "network_error"
  | "upstream_rejected"
  | "empty_profile";

export class SiteProfileError extends Error {
  constructor(
    readonly reason: SiteProfileFailureReason,
    message = "Site analysis failed.",
  ) {
    super(message);
    this.name = "SiteProfileError";
  }
}

export async function fetchSiteProfileDraft(
  website: string,
  { ipHash, fetchImpl = fetch }: { ipHash: string; fetchImpl?: typeof fetch },
): Promise<SiteProfileDraft> {
  const internalServiceKey =
    process.env.E3D_SCANNER_INTERNAL_SERVICE_KEY?.trim() || "";
  if (!internalServiceKey) {
    throw new SiteProfileError("not_configured", "Site analysis is not configured.");
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
    throw new SiteProfileError(
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
    throw new SiteProfileError("upstream_rejected", "That website could not be analyzed.");
  }

  const draft = payload.draft || {};
  const companyName = readField(draft, "companyName");
  const industry = readField(draft, "industry");
  const companyDescription = readField(draft, "companyDescription");

  if (!companyName && !industry && !companyDescription) {
    throw new SiteProfileError(
      "empty_profile",
      "That website did not return enough information to analyze.",
    );
  }

  return { companyName, industry, companyDescription };
}

function readField(draft: Record<string, string | null>, key: string) {
  const value = draft[key];
  return typeof value === "string" ? value.trim() : "";
}
