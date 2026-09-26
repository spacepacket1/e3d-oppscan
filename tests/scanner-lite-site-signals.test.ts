import { describe, expect, it, vi } from "vitest";

import { detectHvacSiteSignals, emptyHvacSiteSignals } from "@/lib/scanner-lite-site-signals";

function htmlResponse(body: string, ok = true) {
  return {
    ok,
    text: async () => body,
  } as Response;
}

describe("detectHvacSiteSignals", () => {
  it("returns all-false signals when the fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await detectHvacSiteSignals("https://example.com", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual(emptyHvacSiteSignals);
  });

  it("returns all-false signals when the response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("<html></html>", false));
    const result = await detectHvacSiteSignals("https://example.com", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual(emptyHvacSiteSignals);
  });

  it("detects each signal independently from real page copy", async () => {
    const html = `
      <html><body>
        <nav><a href="/ac-installation">AC Installation</a></nav>
        <a href="/financing">Financing available -- 0% APR</a>
        <button>Get a Quote Now</button>
        <p>Join our Comfort Club maintenance plan today.</p>
        <p>24/7 emergency service available.</p>
        <p>We install Trane and Carrier systems.</p>
        <p>Read our Google Reviews -- 5-star rated!</p>
      </body></html>
    `;
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(html));
    const result = await detectHvacSiteSignals("https://example.com", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({
      installationOrReplacement: true,
      financingOffered: true,
      quoteOrEstimateCta: true,
      maintenancePlanOrMembership: true,
      emergencyOrSameDayService: true,
      brandNameMentioned: true,
      customerReviewsMentioned: true,
    });
  });

  it("does not detect signals from script/style content, only visible text", async () => {
    const html = `
      <html>
        <head><style>.installation { color: red; }</style></head>
        <body>
          <script>var financing = "0% APR";</script>
          <p>We fix your furnace.</p>
        </body>
      </html>
    `;
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(html));
    const result = await detectHvacSiteSignals("https://example.com", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual(emptyHvacSiteSignals);
  });

  it("leaves unmatched signals false when only some keywords are present", async () => {
    const html = "<p>Call us for a free estimate on your ductwork installation.</p>";
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(html));
    const result = await detectHvacSiteSignals("https://example.com", fetchImpl as unknown as typeof fetch);
    expect(result.installationOrReplacement).toBe(true);
    expect(result.quoteOrEstimateCta).toBe(true);
    expect(result.financingOffered).toBe(false);
    expect(result.maintenancePlanOrMembership).toBe(false);
    expect(result.emergencyOrSameDayService).toBe(false);
    expect(result.brandNameMentioned).toBe(false);
    expect(result.customerReviewsMentioned).toBe(false);
  });
});
