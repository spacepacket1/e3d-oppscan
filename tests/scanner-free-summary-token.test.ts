import { describe, expect, it } from "vitest";

import { signFreeSummary, verifyFreeSummary } from "@/lib/scanner-free-summary-token";

const SECRET = "test-scanner-report-token-secret-32-bytes";
const summary = {
  websiteHost: "redwood.example.com",
  totalFound: 8,
  opportunities: [
    { title: "Automate quoting", summary: "Cut turnaround from days to hours." },
    { title: "Follow up on estimates", summary: "Chase quotes that went quiet." },
  ],
};
const NOW = 1_800_000_000_000;

describe("free summary token", () => {
  it("round-trips a summary it signed", () => {
    const token = signFreeSummary(summary, SECRET, NOW)!;
    expect(verifyFreeSummary(token, SECRET, NOW + 60_000)).toEqual(summary);
  });

  it("refuses to sign or verify without a real secret", () => {
    expect(signFreeSummary(summary, undefined, NOW)).toBeNull();
    expect(signFreeSummary(summary, "short", NOW)).toBeNull();
    const token = signFreeSummary(summary, SECRET, NOW)!;
    expect(verifyFreeSummary(token, undefined, NOW)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signFreeSummary(summary, SECRET, NOW)!;
    expect(verifyFreeSummary(token, "another-secret-of-sufficient-length", NOW)).toBeNull();
  });

  it("rejects a tampered payload even if the signature is kept", () => {
    const token = signFreeSummary(summary, SECRET, NOW)!;
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        h: "evil.example.com",
        n: 1,
        i: NOW,
        o: [{ t: "Send money to this account", s: "phishing text" }],
      }),
    ).toString("base64url");
    expect(verifyFreeSummary(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    for (const bad of ["", "abc", "a.b.c", ".", "a.", ".b"]) {
      expect(verifyFreeSummary(bad, SECRET, NOW)).toBeNull();
    }
  });

  it("expires after two hours and rejects tokens dated in the future", () => {
    const token = signFreeSummary(summary, SECRET, NOW)!;
    expect(verifyFreeSummary(token, SECRET, NOW + 2 * 60 * 60_000 - 1)).not.toBeNull();
    expect(verifyFreeSummary(token, SECRET, NOW + 2 * 60 * 60_000 + 1)).toBeNull();
    expect(verifyFreeSummary(token, SECRET, NOW - 10 * 60_000)).toBeNull();
  });

  it("caps long text and the number of opportunities", () => {
    const long = { title: "t".repeat(500), summary: "s".repeat(2000) };
    const token = signFreeSummary(
      { websiteHost: "x.example.com", totalFound: 20, opportunities: Array(9).fill(long) },
      SECRET,
      NOW,
    )!;
    const verified = verifyFreeSummary(token, SECRET, NOW)!;
    expect(verified.opportunities).toHaveLength(5);
    expect(verified.opportunities[0].title).toHaveLength(200);
    expect(verified.opportunities[0].summary).toHaveLength(600);
  });
});
