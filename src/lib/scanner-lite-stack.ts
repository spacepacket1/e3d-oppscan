// Which field-service software an HVAC business runs on. Two sources feed
// it: the owner optionally ticking tools on the form (self-reported), and a
// best-effort scan of the homepage's raw HTML for the hostnames those
// products' booking widgets and links load from (detected).
//
// Unlike scanner-lite-site-signals.ts (which strips scripts and matches
// visible copy), this has to look at raw markup -- a scheduler embed is an
// iframe/script URL, not text. Same safety rule though: only fixed enum
// values computed here ever cross into an LLM prompt, never scraped text.
//
// Best-effort only: a failed fetch, a bot-blocked site, or a booking widget
// rendered client-side after load all yield "nothing detected", which callers
// must treat as inconclusive. The hostname fingerprints below are a starting
// point and should be checked against real HVAC sites as they are collected.
export const HVAC_PLATFORMS = [
  "servicetitan",
  "housecall_pro",
  "jobber",
  "fieldedge",
  "workiz",
  "service_fusion",
] as const;
export type HvacPlatform = (typeof HVAC_PLATFORMS)[number];

export const HVAC_TOOL_CHOICES = [
  ...HVAC_PLATFORMS,
  "spreadsheets_paper",
  "other",
] as const;
export type HvacToolChoice = (typeof HVAC_TOOL_CHOICES)[number];

export const HVAC_TOOL_LABELS: Record<HvacToolChoice, string> = {
  servicetitan: "ServiceTitan",
  housecall_pro: "Housecall Pro",
  jobber: "Jobber",
  fieldedge: "FieldEdge",
  workiz: "Workiz",
  service_fusion: "Service Fusion",
  spreadsheets_paper: "Spreadsheets or paper",
  other: "Something else",
};

export function isHvacPlatform(value: string): value is HvacPlatform {
  return (HVAC_PLATFORMS as readonly string[]).includes(value);
}

// Server-side allow-list: drops anything not in HVAC_TOOL_CHOICES (a form post
// can carry arbitrary strings), de-duplicates, preserves first-seen order.
export function sanitizeToolChoices(values: readonly string[]): HvacToolChoice[] {
  const allowed = new Set<string>(HVAC_TOOL_CHOICES);
  const seen = new Set<string>();
  const result: HvacToolChoice[] = [];
  for (const value of values) {
    if (!allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value as HvacToolChoice);
  }
  return result;
}

export type HvacDetectedStack = {
  platform: HvacPlatform | null;
  onlineBooking: boolean;
  chatWidget: boolean;
};

export const emptyHvacDetectedStack: HvacDetectedStack = {
  platform: null,
  onlineBooking: false,
  chatWidget: false,
};

const PLATFORM_HOSTS: Record<HvacPlatform, readonly string[]> = {
  servicetitan: ["servicetitan.com"],
  housecall_pro: ["housecallpro.com"],
  jobber: ["getjobber.com"],
  fieldedge: ["fieldedge.com"],
  workiz: ["workiz.com"],
  service_fusion: ["servicefusion.com"],
};

const CHAT_HOSTS: readonly string[] = [
  "podium.com",
  "birdeye.com",
  "intercom.io",
  "intercomcdn.com",
  "drift.com",
  "tawk.to",
  "livechatinc.com",
];

const BOOKING_HOSTS: readonly string[] = ["calendly.com", "acuityscheduling.com"];

const BOOKING_PHRASES: readonly string[] = [
  "book online",
  "schedule online",
  "book an appointment",
  "schedule an appointment",
  "schedule service",
];

const FETCH_TIMEOUT_MS = 8000;
const MAX_HOSTNAMES = 2000;

function hostMatches(host: string, suffix: string) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function extractHostnames(html: string): string[] {
  const hosts: string[] = [];
  const pattern = /(?:https?:)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && hosts.length < MAX_HOSTNAMES) {
    hosts.push(match[1].toLowerCase());
  }
  return hosts;
}

export function detectHvacStackFromHtml(html: string): HvacDetectedStack {
  const hosts = extractHostnames(html);

  let platform: HvacPlatform | null = null;
  let bestCount = 0;
  for (const candidate of HVAC_PLATFORMS) {
    const count = hosts.filter((host) =>
      PLATFORM_HOSTS[candidate].some((suffix) => hostMatches(host, suffix)),
    ).length;
    if (count > bestCount) {
      bestCount = count;
      platform = candidate;
    }
  }

  const chatWidget = hosts.some((host) =>
    CHAT_HOSTS.some((suffix) => hostMatches(host, suffix)),
  );

  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const onlineBooking =
    platform !== null ||
    hosts.some((host) => BOOKING_HOSTS.some((suffix) => hostMatches(host, suffix))) ||
    BOOKING_PHRASES.some((phrase) => visibleText.includes(phrase));

  return { platform, onlineBooking, chatWidget };
}

export async function detectHvacStack(
  website: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HvacDetectedStack> {
  try {
    const response = await fetchImpl(website, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return emptyHvacDetectedStack;
    return detectHvacStackFromHtml(await response.text());
  } catch {
    return emptyHvacDetectedStack;
  }
}
