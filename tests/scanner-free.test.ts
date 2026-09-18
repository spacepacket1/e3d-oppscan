import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const securityMocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
  isTrustedServerActionOrigin: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));
const analysisMocks = vi.hoisted(() => ({
  generateFreeScannerCandidates: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/lib/contact-security", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contact-security")>(
    "@/lib/contact-security",
  );
  return { ...actual, ...securityMocks };
});

vi.mock("@/lib/scanner-analysis", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scanner-analysis")>(
    "@/lib/scanner-analysis",
  );
  return { ...actual, ...analysisMocks };
});

import { submitFreeScannerIntake } from "../app/free/actions";
import {
  FREE_INTAKE_FIELDS,
  emptyFreeScannerIntakeValues,
  freeScannerIntakeValuesFromFormData,
  validateFreeScannerIntakeValues,
  type FreeScannerIntakeValues,
} from "@/lib/scanner-free-intake";
import { rankScannerCandidates } from "@/lib/scanner-scoring";

const validValues: FreeScannerIntakeValues = {
  companyName: "Redwood Fabrication Co.",
  industry: "Custom metal fabrication",
  companyDescription: "Custom sheet-metal fabrication for industrial clients.",
  goalPrimary: "Reduce quoting turnaround time",
  timeConsumingWorkflows: "Manual takeoff from PDF drawings.",
  currentAiUse: "None beyond ChatGPT for the occasional email.",
  website: "",
  turnstileToken: "",
};

function buildFormData(overrides: Partial<FreeScannerIntakeValues> = {}) {
  const merged = { ...validValues, ...overrides };
  const formData = new FormData();
  for (const [key, value] of Object.entries(merged)) {
    formData.set(key, value);
  }
  return formData;
}

const candidates = Array.from({ length: 6 }, (_, index) => ({
  id: `candidate-${index + 1}`,
  title: `Candidate ${index + 1}`,
  summary: "A bounded opportunity.",
  outcomeType: "automation" as const,
  impact: index === 0 ? 5 : 3,
  feasibility: 4,
  timeToValue: 3,
  confidence: 4,
  risk: 2,
  evidence: ["The intake identifies repeated work."],
  firstStep: "Confirm a workflow owner.",
}));

describe("free scanner intake parsing and validation", () => {
  it("parses form data into the six free fields plus honeypot/turnstile", () => {
    const formData = buildFormData({ turnstileToken: "hidden" });
    formData.set("cf-turnstile-response", "turnstile-response-token");

    const parsed = freeScannerIntakeValuesFromFormData(formData);

    expect(parsed).toEqual({
      ...validValues,
      turnstileToken: "turnstile-response-token",
    });
  });

  it("requires every free field and enforces max length", () => {
    const missing = validateFreeScannerIntakeValues(emptyFreeScannerIntakeValues);
    expect(missing.isValid).toBe(false);
    for (const field of FREE_INTAKE_FIELDS) {
      expect(missing.errors[field.key]).toBeTruthy();
    }

    const tooLong = validateFreeScannerIntakeValues({
      ...validValues,
      goalPrimary: "x".repeat(221),
    });
    expect(tooLong.errors.goalPrimary).toMatch(/under 220 characters/);
  });

  it("accepts valid values", () => {
    const result = validateFreeScannerIntakeValues(validValues);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });
});

describe("submitFreeScannerIntake action", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(
      new Headers({
        origin: "https://oppscan.e3d.ai",
        host: "oppscan.e3d.ai",
      }),
    );
    securityMocks.isTrustedServerActionOrigin.mockReturnValue(true);
    securityMocks.isRateLimited.mockReturnValue(false);
    securityMocks.verifyTurnstileToken.mockResolvedValue(true);
    analysisMocks.generateFreeScannerCandidates.mockResolvedValue(
      rankScannerCandidates(candidates),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an untrusted origin without rate-limiting or generating", async () => {
    securityMocks.isTrustedServerActionOrigin.mockReturnValue(false);

    const result = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      buildFormData(),
    );

    expect(result.status).toBe("error");
    expect(result.errors.form).toMatch(/could not be verified/);
    expect(securityMocks.isRateLimited).not.toHaveBeenCalled();
    expect(analysisMocks.generateFreeScannerCandidates).not.toHaveBeenCalled();
  });

  it("returns honeypot fake success without rate-limiting or generating", async () => {
    const result = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      buildFormData({ website: "filled-by-bot" }),
    );

    expect(result.status).toBe("success");
    expect(result.candidates).toBeUndefined();
    expect(securityMocks.isRateLimited).not.toHaveBeenCalled();
    expect(analysisMocks.generateFreeScannerCandidates).not.toHaveBeenCalled();
  });

  it("rejects when rate-limited without generating", async () => {
    securityMocks.isRateLimited.mockReturnValue(true);

    const result = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      buildFormData(),
    );

    expect(result.status).toBe("error");
    expect(result.errors.form).toMatch(/Too many free summaries/);
    expect(analysisMocks.generateFreeScannerCandidates).not.toHaveBeenCalled();
  });

  it("rejects invalid values without checking turnstile or generating", async () => {
    const result = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      buildFormData({ goalPrimary: "" }),
    );

    expect(result.status).toBe("error");
    expect(result.errors.goalPrimary).toBeTruthy();
    expect(securityMocks.verifyTurnstileToken).not.toHaveBeenCalled();
    expect(analysisMocks.generateFreeScannerCandidates).not.toHaveBeenCalled();
  });

  it("rejects a failed turnstile check without generating", async () => {
    securityMocks.verifyTurnstileToken.mockResolvedValue(false);

    const result = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      buildFormData(),
    );

    expect(result.status).toBe("error");
    expect(result.errors.form).toMatch(/Bot protection/);
    expect(analysisMocks.generateFreeScannerCandidates).not.toHaveBeenCalled();
  });

  it("returns exactly the top 3 ranked candidates plus the total found on success", async () => {
    const ranked = rankScannerCandidates(candidates);
    analysisMocks.generateFreeScannerCandidates.mockResolvedValue(ranked);

    const result = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      buildFormData(),
    );

    expect(result.status).toBe("success");
    expect(result.candidates).toEqual(ranked.slice(0, 3));
    expect(result.totalFound).toBe(6);
  });

  it("returns a controlled error with no candidates when generation fails", async () => {
    analysisMocks.generateFreeScannerCandidates.mockRejectedValue(new Error("boom"));

    const result = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      buildFormData(),
    );

    expect(result.status).toBe("error");
    expect(result.candidates).toBeUndefined();
    expect(result.errors.form).toMatch(/could not be generated/);
  });
});
