import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearHvacLiteRateLimitForTests,
  isHvacLiteRateLimited,
} from "@/lib/scanner-lite-rate-limit";

describe("scanner-lite-rate-limit", () => {
  beforeEach(() => {
    clearHvacLiteRateLimitForTests();
  });

  afterEach(() => {
    clearHvacLiteRateLimitForTests();
  });

  it("allows up to the per-window cap for one IP, then blocks", () => {
    const now = Date.parse("2026-09-25T12:00:00.000Z");
    expect(isHvacLiteRateLimited("1.1.1.1", now)).toBe(false);
    expect(isHvacLiteRateLimited("1.1.1.1", now + 1000)).toBe(false);
    expect(isHvacLiteRateLimited("1.1.1.1", now + 2000)).toBe(false);
    expect(isHvacLiteRateLimited("1.1.1.1", now + 3000)).toBe(true);
  });

  it("resets the per-window cap once the window elapses", () => {
    const now = Date.parse("2026-09-25T12:00:00.000Z");
    for (let i = 0; i < 3; i += 1) {
      expect(isHvacLiteRateLimited("1.1.1.1", now + i * 100)).toBe(false);
    }
    expect(isHvacLiteRateLimited("1.1.1.1", now + 200)).toBe(true);
    expect(isHvacLiteRateLimited("1.1.1.1", now + 10 * 60_000 + 1)).toBe(false);
  });

  it("tracks separate IPs independently within the per-window cap", () => {
    const now = Date.parse("2026-09-25T12:00:00.000Z");
    for (let i = 0; i < 3; i += 1) {
      expect(isHvacLiteRateLimited("1.1.1.1", now)).toBe(false);
    }
    expect(isHvacLiteRateLimited("2.2.2.2", now)).toBe(false);
  });

  it("enforces a global per-day cap across all IPs", () => {
    const now = Date.parse("2026-09-25T12:00:00.000Z");
    let blockedAt = -1;
    for (let i = 0; i < 305; i += 1) {
      const blocked = isHvacLiteRateLimited(`ip-${i}`, now + i);
      if (blocked) {
        blockedAt = i;
        break;
      }
    }
    expect(blockedAt).toBe(300);
  });

  it("resets the global daily cap on a new calendar day", () => {
    const day1 = Date.parse("2026-09-25T23:59:59.000Z");
    const day2 = Date.parse("2026-09-26T00:00:01.000Z");
    for (let i = 0; i < 300; i += 1) {
      isHvacLiteRateLimited(`ip-${i}`, day1);
    }
    expect(isHvacLiteRateLimited("ip-new", day1)).toBe(true);
    expect(isHvacLiteRateLimited("ip-new", day2)).toBe(false);
  });
});
