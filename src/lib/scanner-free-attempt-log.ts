import {
  classifyUserAgent,
  hashClientIp,
  summarizeWebsiteHost,
  trimUserAgent,
} from "@/lib/scanner-lite-attempt-log";

// One structured, non-personal log line per /free attempt, mirroring the HVAC
// log (see scanner-lite-attempt-log.ts): outcome code, the website's hostname,
// a short IP hash, and a trimmed user agent plus browser flags -- never the
// email address, raw IP, or free text. Two stages share this log: generating
// the summary, and the optional email capture that follows it.
export type FreeAttemptStage = "summary" | "lead_capture";

export type FreeAttemptOutcome =
  | "rejected_origin"
  | "rejected_honeypot"
  | "rejected_rate_limit"
  | "rejected_validation"
  | "rejected_turnstile"
  | "rejected_summary_token"
  | "failed"
  | "succeeded";

export type FreeAttemptEntry = {
  attemptId: string;
  stage: FreeAttemptStage;
  outcome: FreeAttemptOutcome;
  reason?: string;
  websiteHost: string;
  turnstileTokenProvided: boolean;
  ipHash: string;
  userAgent: string;
  uaFlags: string[];
  // Lead capture only.
  emailProvided?: boolean;
  marketingOptIn?: boolean;
};

export function buildFreeAttemptContext({
  clientIp,
  rawUserAgent,
  website,
}: {
  clientIp: string;
  rawUserAgent: string | null;
  website: string;
}) {
  return {
    websiteHost: summarizeWebsiteHost(website),
    ipHash: hashClientIp(clientIp),
    userAgent: trimUserAgent(rawUserAgent),
    uaFlags: classifyUserAgent(rawUserAgent),
  };
}

// Logging must never change what the visitor sees.
export function logFreeAttempt(entry: FreeAttemptEntry) {
  try {
    console.log(
      JSON.stringify({ freeAttempt: { timestamp: new Date().toISOString(), ...entry } }),
    );
  } catch {
    // Intentionally ignored.
  }
}
