import { createHash, timingSafeEqual } from "node:crypto";

// Bearer-token check for the read-only ops feed. Fails closed: when no token
// is configured (or it is too short to be a real secret) the feed reports
// "disabled" and serves nothing, so a missing env var can never leave the
// endpoint open.
export const MIN_OPS_FEED_TOKEN_LENGTH = 32;

export type OpsFeedAuthResult = "ok" | "unauthorized" | "disabled";

export function checkOpsFeedAuth(
  authorizationHeader: string | null,
  configuredToken: string | undefined,
): OpsFeedAuthResult {
  const expected = configuredToken?.trim() ?? "";
  if (expected.length < MIN_OPS_FEED_TOKEN_LENGTH) return "disabled";

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader?.trim() ?? "");
  if (!match) return "unauthorized";

  // Hash both sides so timingSafeEqual always compares equal-length buffers
  // and the comparison time does not depend on how much of the token matched.
  const given = createHash("sha256").update(match[1].trim()).digest();
  const wanted = createHash("sha256").update(expected).digest();
  return timingSafeEqual(given, wanted) ? "ok" : "unauthorized";
}
