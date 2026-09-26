// Lightweight, deterministic detection of HVAC-relevant signals on a
// business's homepage -- closes the gap where the shared, generic company
// profile (fetchHvacLiteCompanyProfile) summarizes a site too shallowly for
// the analysis to ground evidence-specific opportunities like quote
// generation or financing on. Only a fixed vocabulary of true/false flags
// computed by this code crosses into the LLM prompt, not raw scraped page
// text -- deliberately narrower prompt-injection surface than feeding the
// page's own words to the model.
//
// Best-effort only: a failed fetch, a bot-blocked site, or wording this
// keyword list doesn't anticipate all just yield all-false signals. The
// analysis prompt is told to treat false as inconclusive, never as
// evidence the business lacks that offering.
export type HvacSiteSignals = {
  installationOrReplacement: boolean;
  financingOffered: boolean;
  quoteOrEstimateCta: boolean;
  maintenancePlanOrMembership: boolean;
  emergencyOrSameDayService: boolean;
  brandNameMentioned: boolean;
  customerReviewsMentioned: boolean;
};

export const emptyHvacSiteSignals: HvacSiteSignals = {
  installationOrReplacement: false,
  financingOffered: false,
  quoteOrEstimateCta: false,
  maintenancePlanOrMembership: false,
  emergencyOrSameDayService: false,
  brandNameMentioned: false,
  customerReviewsMentioned: false,
};

const SIGNAL_KEYWORDS: Record<keyof HvacSiteSignals, readonly string[]> = {
  installationOrReplacement: [
    "installation",
    "install a new",
    "replace your",
    "new system",
    "system replacement",
  ],
  financingOffered: [
    "financing",
    "$0 down",
    "0% apr",
    "monthly payments",
    "apply for financing",
    "buy now pay later",
  ],
  quoteOrEstimateCta: [
    "get a quote",
    "free estimate",
    "request a quote",
    "schedule an estimate",
    "get an estimate",
    "request an estimate",
  ],
  maintenancePlanOrMembership: [
    "maintenance plan",
    "membership plan",
    "tune-up plan",
    "service agreement",
    "comfort club",
    "priority club",
  ],
  emergencyOrSameDayService: [
    "24/7",
    "24-hour",
    "emergency service",
    "same day service",
    "same-day service",
    "around the clock",
  ],
  brandNameMentioned: [
    "trane",
    "carrier",
    "lennox",
    "goodman",
    "rheem",
    "york",
    "american standard",
    "bryant",
    "daikin",
    "mitsubishi electric",
  ],
  customerReviewsMentioned: [
    "google reviews",
    "5-star",
    "5 star",
    "testimonials",
    "read our reviews",
    "customer reviews",
  ],
};

const FETCH_TIMEOUT_MS = 8000;

export async function detectHvacSiteSignals(
  website: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HvacSiteSignals> {
  let text: string;
  try {
    const response = await fetchImpl(website, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return emptyHvacSiteSignals;
    const html = await response.text();
    text = stripHtmlToLowerText(html);
  } catch {
    return emptyHvacSiteSignals;
  }

  const signals = { ...emptyHvacSiteSignals };
  for (const key of Object.keys(SIGNAL_KEYWORDS) as (keyof HvacSiteSignals)[]) {
    signals[key] = SIGNAL_KEYWORDS[key].some((keyword) => text.includes(keyword));
  }
  return signals;
}

function stripHtmlToLowerText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
