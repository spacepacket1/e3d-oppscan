import { describe, expect, it } from "vitest";

import {
  buildFreeLeadId,
  freeLeadValuesFromFormData,
  validateFreeLeadValues,
  emptyFreeLeadValues,
} from "@/lib/scanner-free-lead";
import { isFreeLeadRateLimited, clearFreeLeadRateLimitForTests } from "@/lib/scanner-free-lead-rate-limit";

describe("free lead values", () => {
  it("parses the email, consent, honeypot, turnstile and token fields", () => {
    const formData = new FormData();
    formData.set("email", "  Owner@Example.com ");
    formData.set("marketingOptIn", "on");
    formData.set("summaryToken", "tok");
    formData.set("cf-turnstile-response", "turnstile-token");
    expect(freeLeadValuesFromFormData(formData)).toEqual({
      email: "  Owner@Example.com ",
      marketingOptIn: true,
      website: "",
      turnstileToken: "turnstile-token",
      summaryToken: "tok",
    });
  });

  it("treats a missing consent checkbox as opted out", () => {
    expect(freeLeadValuesFromFormData(new FormData()).marketingOptIn).toBe(false);
  });

  it("requires a valid email and trims it", () => {
    expect(validateFreeLeadValues(emptyFreeLeadValues).errors.email).toBeTruthy();
    expect(validateFreeLeadValues({ ...emptyFreeLeadValues, email: "nope" }).errors.email).toMatch(/valid/);
    expect(validateFreeLeadValues({ ...emptyFreeLeadValues, email: "a@b" }).errors.email).toBeTruthy();
    const ok = validateFreeLeadValues({ ...emptyFreeLeadValues, email: "  me@example.com " });
    expect(ok.isValid).toBe(true);
    expect(ok.values.email).toBe("me@example.com");
    expect(
      validateFreeLeadValues({ ...emptyFreeLeadValues, email: `${"a".repeat(200)}@example.com` }).errors.email,
    ).toMatch(/200/);
  });
});

describe("buildFreeLeadId", () => {
  it("is stable, case-insensitive, and distinct per email and site", () => {
    const id = buildFreeLeadId("Owner@Example.com", "Site.example.com");
    expect(id).toBe(buildFreeLeadId(" owner@example.com ", "site.example.com"));
    expect(id).toMatch(/^free_lead_[0-9a-f]{32}$/);
    expect(id).not.toBe(buildFreeLeadId("other@example.com", "site.example.com"));
    expect(id).not.toBe(buildFreeLeadId("owner@example.com", "other.example.com"));
    expect(id).not.toContain("example");
  });
});

describe("isFreeLeadRateLimited", () => {
  it("allows three per window per IP, then limits, and resets after the window", () => {
    clearFreeLeadRateLimitForTests();
    const t = Date.now();
    expect([1, 2, 3].map(() => isFreeLeadRateLimited("1.1.1.1", t))).toEqual([false, false, false]);
    expect(isFreeLeadRateLimited("1.1.1.1", t)).toBe(true);
    expect(isFreeLeadRateLimited("2.2.2.2", t)).toBe(false);
    expect(isFreeLeadRateLimited("1.1.1.1", t + 11 * 60_000)).toBe(false);
    clearFreeLeadRateLimitForTests();
  });
});
