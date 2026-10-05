import { createHash } from "node:crypto";

// One structured log line per /hvac submission attempt, so a POST that never
// became a report can be explained. Deliberately free of personal data: no
// email, no raw IP, no free-text -- only an outcome code, the business
// website's hostname (a business domain, not a person), a short IP hash for
// correlating repeat attempts, and a trimmed user agent for spotting bots.
// Written to stdout like scanner-telemetry.ts, so it lands in the PM2 log.
//
// A submission that passes the early checks is answered immediately with
// "accepted"; the report is then generated in the background and a second line
// with the same attemptId records how that ended ("succeeded" or "failed").
export type HvacLiteAttemptOutcome =
  | "rejected_origin"
  | "rejected_honeypot"
  | "rejected_rate_limit"
  | "rejected_validation"
  | "rejected_turnstile"
  | "accepted"
  | "failed"
  | "succeeded";

export type HvacLiteAttemptEntry = {
  // Random per-submission id (not derived from anything about the visitor) so
  // the "accepted" line and its later "succeeded"/"failed" line can be joined.
  attemptId: string;
  outcome: HvacLiteAttemptOutcome;
  // Machine-readable detail: failing field names for validation, the
  // error keys for a failed run, or "exception".
  reason?: string;
  websiteHost: string;
  emailProvided: boolean;
  turnstileTokenProvided: boolean;
  toolsSelected: number;
  ipHash: string;
  userAgent: string;
  // Derived from the FULL user agent before trimming; the in-app browser
  // markers usually sit past the first 100 characters.
  uaFlags: string[];
};

export function hashClientIp(clientIp: string) {
  return createHash("sha256").update(clientIp).digest("hex").slice(0, 12);
}

// Hostname only, lowercased and capped. Never the path or query, which can
// carry anything.
export function summarizeWebsiteHost(website: string) {
  const trimmed = website.trim();
  if (!trimmed) return "none";
  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const host = new URL(candidate).hostname.toLowerCase();
    return host ? host.slice(0, 100) : "unparseable";
  } catch {
    return "unparseable";
  }
}

// Coarse, non-identifying browser classes. The in-app flags matter most:
// most Meta ad clicks open in the Facebook or Instagram in-app browser, which
// treats scripts and bot-check widgets differently from Safari or Chrome.
export function classifyUserAgent(userAgent: string | null): string[] {
  const ua = userAgent ?? "";
  const flags: string[] = [];
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|FBSV/i.test(ua)) flags.push("facebook_inapp");
  if (/Instagram/i.test(ua)) flags.push("instagram_inapp");
  if (/iPhone|iPad|Android|Mobile/i.test(ua)) flags.push("mobile");
  if (/HeadlessChrome|PhantomJS/i.test(ua)) flags.push("headless");
  if (/bot|crawl|spider|curl|wget|python-requests|httpclient/i.test(ua)) flags.push("bot_like");
  return flags;
}

export function trimUserAgent(userAgent: string | null) {
  return (userAgent ?? "").replace(/[\r\n]/g, " ").slice(0, 100);
}

// Logging must never change what the visitor sees.
export function logHvacLiteAttempt(entry: HvacLiteAttemptEntry) {
  try {
    console.log(
      JSON.stringify({
        hvacLiteAttempt: { timestamp: new Date().toISOString(), ...entry },
      }),
    );
  } catch {
    // Intentionally ignored.
  }
}
