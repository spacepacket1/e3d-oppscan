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

import { classifyUserAgent } from "@/lib/scanner-lite-attempt-log";

describe("classifyUserAgent", () => {
  it("flags Facebook and Instagram in-app browsers", () => {
    expect(
      classifyUserAgent("Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]"),
    ).toEqual(expect.arrayContaining(["facebook_inapp", "mobile"]));
    expect(classifyUserAgent("Mozilla/5.0 (Linux; Android 14) Instagram 330.0")).toEqual(
      expect.arrayContaining(["instagram_inapp", "mobile"]),
    );
  });

  it("flags headless and bot-like agents, and leaves a normal desktop browser unflagged", () => {
    expect(classifyUserAgent("Mozilla/5.0 HeadlessChrome/148.0")).toContain("headless");
    expect(classifyUserAgent("curl/7.81.0")).toContain("bot_like");
    expect(classifyUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/144.0 Safari/537.36")).toEqual([]);
    expect(classifyUserAgent(null)).toEqual([]);
  });
});
