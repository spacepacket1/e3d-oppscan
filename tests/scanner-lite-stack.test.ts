import { describe, expect, it, vi } from "vitest";

import {
  detectHvacStack,
  detectHvacStackFromHtml,
  emptyHvacDetectedStack,
  sanitizeToolChoices,
} from "@/lib/scanner-lite-stack";

describe("sanitizeToolChoices", () => {
  it("drops unknown values and duplicates, keeping first-seen order", () => {
    expect(
      sanitizeToolChoices(["jobber", "bogus", "jobber", "other", "servicetitan"]),
    ).toEqual(["jobber", "other", "servicetitan"]);
  });
});

describe("detectHvacStackFromHtml", () => {
  it("detects a platform from a booking iframe URL", () => {
    const html = `<iframe src="https://clienthub.getjobber.com/client_hubs/abc/public/work_request/embed"></iframe>`;
    expect(detectHvacStackFromHtml(html)).toEqual({
      platform: "jobber",
      onlineBooking: true,
      chatWidget: false,
    });
  });

  it("detects a protocol-relative script host and a chat widget", () => {
    const html = `<script src="//widget.podium.com/loader.js"></script><a href="https://book.housecallpro.com/book/x">Book</a>`;
    const result = detectHvacStackFromHtml(html);
    expect(result.platform).toBe("housecall_pro");
    expect(result.chatWidget).toBe(true);
  });

  it("does not match a lookalike hostname", () => {
    const html = `<a href="https://notservicetitan.com/x">x</a>`;
    expect(detectHvacStackFromHtml(html).platform).toBeNull();
  });

  it("picks the platform with the most hostname hits", () => {
    const html = `
      <a href="https://servicetitan.com/blog">post</a>
      <script src="https://a.housecallpro.com/1.js"></script>
      <script src="https://b.housecallpro.com/2.js"></script>`;
    expect(detectHvacStackFromHtml(html).platform).toBe("housecall_pro");
  });

  it("flags online booking from visible copy even with no platform", () => {
    const result = detectHvacStackFromHtml("<p>Schedule online in 60 seconds</p>");
    expect(result).toEqual({ platform: null, onlineBooking: true, chatWidget: false });
  });

  it("returns nothing for a plain page", () => {
    expect(detectHvacStackFromHtml("<p>We fix furnaces.</p>")).toEqual(
      emptyHvacDetectedStack,
    );
  });
});

describe("detectHvacStack", () => {
  it("returns the empty stack when the fetch throws or is not ok", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("down"));
    expect(await detectHvacStack("https://x.example", failing as unknown as typeof fetch)).toEqual(
      emptyHvacDetectedStack,
    );
    const notOk = vi.fn().mockResolvedValue({ ok: false, text: async () => "" });
    expect(await detectHvacStack("https://x.example", notOk as unknown as typeof fetch)).toEqual(
      emptyHvacDetectedStack,
    );
  });
});
