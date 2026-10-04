import { describe, expect, it } from "vitest";

import {
  hashClientIp,
  summarizeWebsiteHost,
  trimUserAgent,
} from "@/lib/scanner-lite-attempt-log";

describe("summarizeWebsiteHost", () => {
  it("keeps only the lowercased hostname", () => {
    expect(summarizeWebsiteHost("https://WWW.Redwood.example.com/a/b?token=secret")).toBe(
      "www.redwood.example.com",
    );
    expect(summarizeWebsiteHost("redwood.example.com/path")).toBe("redwood.example.com");
  });

  it("reports empty and unparseable input without echoing it", () => {
    expect(summarizeWebsiteHost("   ")).toBe("none");
    expect(summarizeWebsiteHost("http://")).toBe("unparseable");
    expect(summarizeWebsiteHost("not a url at all")).toBe("unparseable");
  });

  it("caps very long hostnames", () => {
    expect(summarizeWebsiteHost(`https://${"a".repeat(300)}.com`).length).toBeLessThanOrEqual(100);
  });
});

describe("hashClientIp", () => {
  it("is a stable 12-char hex digest that does not contain the IP", () => {
    const hash = hashClientIp("203.0.113.9");
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
    expect(hash).toBe(hashClientIp("203.0.113.9"));
    expect(hash).not.toBe(hashClientIp("203.0.113.10"));
  });
});

describe("trimUserAgent", () => {
  it("strips newlines, caps length, and tolerates null", () => {
    expect(trimUserAgent("a\nb\rc")).toBe("a b c");
    expect(trimUserAgent("x".repeat(500))).toHaveLength(100);
    expect(trimUserAgent(null)).toBe("");
  });
});
