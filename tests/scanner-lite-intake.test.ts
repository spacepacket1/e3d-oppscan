import { describe, expect, it } from "vitest";

import {
  emptyHvacLiteIntakeValues,
  hvacLiteIntakeValuesFromFormData,
  validateHvacLiteIntakeValues,
  type HvacLiteIntakeValues,
} from "@/lib/scanner-lite-intake";

const validValues: HvacLiteIntakeValues = {
  companyWebsite: "https://redwoodhvac.example.com",
  workEmail: "owner@redwoodhvac.example.com",
  marketingOptIn: false,
  website: "",
  turnstileToken: "",
};

function buildFormData(overrides: Partial<HvacLiteIntakeValues> = {}) {
  const merged = { ...validValues, ...overrides };
  const formData = new FormData();
  formData.set("companyWebsite", merged.companyWebsite);
  formData.set("workEmail", merged.workEmail);
  if (merged.marketingOptIn) formData.set("marketingOptIn", "on");
  formData.set("website", merged.website);
  formData.set("turnstileToken", merged.turnstileToken);
  return formData;
}

describe("hvacLiteIntakeValuesFromFormData", () => {
  it("parses the two real fields plus the consent checkbox and honeypot", () => {
    const formData = buildFormData({ marketingOptIn: true, turnstileToken: "hidden" });
    formData.set("cf-turnstile-response", "turnstile-response-token");

    expect(hvacLiteIntakeValuesFromFormData(formData)).toEqual({
      ...validValues,
      marketingOptIn: true,
      turnstileToken: "turnstile-response-token",
    });
  });

  it("treats a missing checkbox field as opted out", () => {
    const formData = buildFormData();
    formData.delete("marketingOptIn");
    expect(hvacLiteIntakeValuesFromFormData(formData).marketingOptIn).toBe(false);
  });
});

describe("validateHvacLiteIntakeValues", () => {
  it("requires both real fields", () => {
    const result = validateHvacLiteIntakeValues(emptyHvacLiteIntakeValues);
    expect(result.isValid).toBe(false);
    expect(result.errors.companyWebsite).toMatch(/required/);
    expect(result.errors.workEmail).toMatch(/required/);
  });

  it("accepts valid values, normalizing a bare domain into a URL", () => {
    const result = validateHvacLiteIntakeValues({
      ...validValues,
      companyWebsite: "redwoodhvac.example.com",
    });
    expect(result.isValid).toBe(true);
    expect(result.values.companyWebsite).toBe("https://redwoodhvac.example.com");
  });

  it("rejects an invalid website URL", () => {
    const result = validateHvacLiteIntakeValues({
      ...validValues,
      companyWebsite: "not a url",
    });
    expect(result.errors.companyWebsite).toMatch(/valid website URL/);
  });

  it("rejects an invalid email address", () => {
    const result = validateHvacLiteIntakeValues({
      ...validValues,
      workEmail: "not-an-email",
    });
    expect(result.errors.workEmail).toMatch(/valid email address/);
  });

  it("enforces max length on both fields", () => {
    const result = validateHvacLiteIntakeValues({
      ...validValues,
      workEmail: `${"a".repeat(195)}@example.com`,
    });
    expect(result.errors.workEmail).toMatch(/under 200 characters/);
  });
});
