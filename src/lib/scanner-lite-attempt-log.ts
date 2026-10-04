import { createHash } from "node:crypto";

// One structured log line per /hvac submission attempt, so a POST that never
// became a report can be explained. Deliberately free of personal data: no
// email, no raw IP, no free-text -- only an outcome code, the business
// website's hostname (a business domain, not a person), a short IP hash for
// correlating repeat attempts, and a trimmed user agent for spotting bots.
// Written to stdout like scanner-telemetry.ts, so it lands in the PM2 log.
export type HvacLiteAttemptOutcome =
  | "rejected_origin"
  | "rejected_honeypot"
  | "rejected_rate_limit"
  | "rejected_validation"
  | "rejected_turnstile"
  | "failed"
  | "succeeded";

export type HvacLiteAttemptEntry = {
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
