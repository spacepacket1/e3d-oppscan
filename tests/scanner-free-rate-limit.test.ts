import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearFreeRateLimitsForTests,
  isFreeAnalysisRateLimited,
  isFreePrefillRateLimited,
} from "@/lib/scanner-free-rate-limit";

describe("scanner-free-rate-limit", () => {
  beforeEach(() => {
    clearFreeRateLimitsForTests();
  });

  afterEach(() => {
    clearFreeRateLimitsForTests();
  });

  it("allows up to the per-window cap for one IP, then blocks", () => {
    const now = Date.parse("2026-09-18T12:00:00.000Z");
    expect(isFreeAnalysisRateLimited("1.1.1.1", now)).toBe(false);
    expect(isFreeAnalysisRateLimited("1.1.1.1", now + 1000)).toBe(false);
    expect(isFreeAnalysisRateLimited("1.1.1.1", now + 2000)).toBe(false);
    expect(isFreeAnalysisRateLimited("1.1.1.1", now + 3000)).toBe(true);
  });

  it("resets the per-window cap once the window elapses", () => {
    const now = Date.parse("2026-09-18T12:00:00.000Z");
    for (let i = 0; i < 3; i += 1) {
      expect(isFreeAnalysisRateLimited("1.1.1.1", now + i * 100)).toBe(false);
    }
    expect(isFreeAnalysisRateLimited("1.1.1.1", now + 200)).toBe(true);
    expect(isFreeAnalysisRateLimited("1.1.1.1", now + 10 * 60_000 + 1)).toBe(false);
  });

  it("tracks separate IPs independently within the per-window cap", () => {
    const now = Date.parse("2026-09-18T12:00:00.000Z");
    for (let i = 0; i < 3; i += 1) {
      expect(isFreeAnalysisRateLimited("1.1.1.1", now)).toBe(false);
    }
    expect(isFreeAnalysisRateLimited("2.2.2.2", now)).toBe(false);
  });

  it("enforces a global per-day cap across all IPs, tighter than the per-IP cap alone", () => {
    const now = Date.parse("2026-09-18T12:00:00.000Z");
    // 300/day cap: exhaust it across many distinct IPs, each well under
    // their own per-window cap, to prove the global cap is independent.
    let blockedAt = -1;
    for (let i = 0; i < 305; i += 1) {
      const blocked = isFreeAnalysisRateLimited(`ip-${i}`, now + i);
      if (blocked) {
        blockedAt = i;
        break;
      }
    }
    expect(blockedAt).toBe(300);
  });

  it("resets the global daily cap on a new calendar day", () => {
    const day1 = Date.parse("2026-09-18T23:59:59.000Z");
    const day2 = Date.parse("2026-09-19T00:00:01.000Z");
    for (let i = 0; i < 300; i += 1) {
      isFreeAnalysisRateLimited(`ip-${i}`, day1);
    }
    expect(isFreeAnalysisRateLimited("ip-new", day1)).toBe(true);
    expect(isFreeAnalysisRateLimited("ip-new", day2)).toBe(false);
  });

  it("keeps the prefill limiter's state independent of the analysis limiter", () => {
    const now = Date.parse("2026-09-18T12:00:00.000Z");
    expect(isFreeAnalysisRateLimited("1.1.1.1", now)).toBe(false);
    expect(isFreeAnalysisRateLimited("1.1.1.1", now)).toBe(false);
    expect(isFreeAnalysisRateLimited("1.1.1.1", now)).toBe(false);
    expect(isFreeAnalysisRateLimited("1.1.1.1", now)).toBe(true);

    // Prefill has its own, more generous per-window cap (5) and is
    // unaffected by the analysis limiter above having already tripped.
    expect(isFreePrefillRateLimited("1.1.1.1", now)).toBe(false);
    expect(isFreePrefillRateLimited("1.1.1.1", now)).toBe(false);
    expect(isFreePrefillRateLimited("1.1.1.1", now)).toBe(false);
    expect(isFreePrefillRateLimited("1.1.1.1", now)).toBe(false);
    expect(isFreePrefillRateLimited("1.1.1.1", now)).toBe(false);
    expect(isFreePrefillRateLimited("1.1.1.1", now)).toBe(true);
  });
});
