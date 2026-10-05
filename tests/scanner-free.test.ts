import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const securityMocks = vi.hoisted(() => ({
  isTrustedServerActionOrigin: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));
const rateLimitMocks = vi.hoisted(() => ({
  isFreeAnalysisRateLimited: vi.fn(),
}));
const analysisMocks = vi.hoisted(() => ({
  generateFreeScannerCandidates: vi.fn(),
}));
const profileMocks = vi.hoisted(() => ({
  fetchSiteProfileDraft: vi.fn(),
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

vi.mock("@/lib/scanner-free-rate-limit", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/scanner-free-rate-limit")
  >("@/lib/scanner-free-rate-limit");
  return { ...actual, ...rateLimitMocks };
});

vi.mock("@/lib/scanner-analysis", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scanner-analysis")>(
    "@/lib/scanner-analysis",
  );
  return { ...actual, ...analysisMocks };
});

vi.mock("@/lib/scanner-site-profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scanner-site-profile")>(
    "@/lib/scanner-site-profile",
  );
  return { ...actual, ...profileMocks };
});

import { submitFreeScannerIntake } from "../app/free/actions";
import {
  FREE_DEFAULT_AI_USE,
  FREE_DEFAULT_GOAL,
  FREE_DEFAULT_WORKFLOWS,
  FREE_INTAKE_FIELDS,
  FREE_PROFILE_UNAVAILABLE_MESSAGE,
  completeFreeScannerValues,
  emptyFreeScannerIntakeValues,
  freeScannerIntakeValuesFromFormData,
  mergeFreeScannerIntakeDraft,
  validateFreeScannerIntakeValues,
  type FreeScannerIntakeValues,
} from "@/lib/scanner-free-intake";
import { rankScannerCandidates } from "@/lib/scanner-scoring";

const validValues: FreeScannerIntakeValues = {
  companyWebsite: "https://redwoodfab.example.com",
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
  it("parses form data into the seven free fields plus honeypot/turnstile", () => {
    const formData = buildFormData({ turnstileToken: "hidden" });
    formData.set("cf-turnstile-response", "turnstile-response-token");

    const parsed = freeScannerIntakeValuesFromFormData(formData);

    expect(parsed).toEqual({
      ...validValues,
      turnstileToken: "turnstile-response-token",
    });
  });

  it("requires only the website; every other field is optional", () => {
    const missing = validateFreeScannerIntakeValues(emptyFreeScannerIntakeValues);
    expect(missing.isValid).toBe(false);
    expect(Object.keys(missing.errors)).toEqual(["companyWebsite"]);
    expect(FREE_INTAKE_FIELDS.filter((field) => field.required).map((f) => f.key)).toEqual([
      "companyWebsite",
    ]);

    const websiteOnly = validateFreeScannerIntakeValues({
      ...emptyFreeScannerIntakeValues,
      companyWebsite: "redwoodfab.example.com",
    });
    expect(websiteOnly.isValid).toBe(true);
    expect(websiteOnly.values.companyWebsite).toBe("https://redwoodfab.example.com");
  });

  it("still enforces max length on the optional fields", () => {

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

  it("rejects an invalid companyWebsite URL", () => {
    const result = validateFreeScannerIntakeValues({
      ...validValues,
      companyWebsite: "not a url",
    });
    expect(result.errors.companyWebsite).toMatch(/valid website URL/);
  });
});

describe("mergeFreeScannerIntakeDraft", () => {
  it("fills only the three prefillable fields, never overwriting typed values", () => {
    const merged = mergeFreeScannerIntakeDraft(
      { ...emptyFreeScannerIntakeValues, companyWebsite: "https://acme.example" },
      {
        companyName: "Acme Logistics",
        industry: "Logistics",
        companyDescription: "Moves boxes.",
      },
    );
    expect(merged.values.companyName).toBe("Acme Logistics");
    expect(merged.values.industry).toBe("Logistics");
    expect(merged.values.companyDescription).toBe("Moves boxes.");
    expect(merged.draftedFields.sort()).toEqual(
      ["companyName", "companyDescription", "industry"].sort(),
    );
  });

  it("does not overwrite a field the person already typed", () => {
    const merged = mergeFreeScannerIntakeDraft(
      { ...emptyFreeScannerIntakeValues, companyName: "Already Typed Co" },
      { companyName: "Acme Logistics", industry: "Logistics" },
    );
    expect(merged.values.companyName).toBe("Already Typed Co");
    expect(merged.values.industry).toBe("Logistics");
    expect(merged.draftedFields).toEqual(["industry"]);
  });

  it("ignores null draft values and fields outside the prefillable set", () => {
    const merged = mergeFreeScannerIntakeDraft(emptyFreeScannerIntakeValues, {
      companyName: null,
      industry: "Logistics",
    });
    expect(merged.values.companyName).toBe("");
    expect(merged.draftedFields).toEqual(["industry"]);
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
    rateLimitMocks.isFreeAnalysisRateLimited.mockReturnValue(false);
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
    expect(rateLimitMocks.isFreeAnalysisRateLimited).not.toHaveBeenCalled();
    expect(analysisMocks.generateFreeScannerCandidates).not.toHaveBeenCalled();
  });

  it("returns honeypot fake success without rate-limiting or generating", async () => {
    const result = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      buildFormData({ website: "filled-by-bot" }),
    );

    expect(result.status).toBe("success");
    expect(result.candidates).toBeUndefined();
    expect(rateLimitMocks.isFreeAnalysisRateLimited).not.toHaveBeenCalled();
    expect(analysisMocks.generateFreeScannerCandidates).not.toHaveBeenCalled();
  });

  it("rejects when rate-limited without generating", async () => {
    rateLimitMocks.isFreeAnalysisRateLimited.mockReturnValue(true);

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
      buildFormData({ companyWebsite: "" }),
    );

    expect(result.status).toBe("error");
    expect(result.errors.companyWebsite).toBeTruthy();
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

describe("completeFreeScannerValues", () => {
  const site = { ...emptyFreeScannerIntakeValues, companyWebsite: "https://redwoodfab.example.com" };
  const draft = {
    companyName: "Redwood Fab",
    industry: "Metal fabrication",
    companyDescription: "Sheet metal for industrial clients.",
  };

  it("fills blanks from the site, then neutral defaults", () => {
    const done = completeFreeScannerValues(site, draft);
    expect(done).toMatchObject({
      companyName: "Redwood Fab",
      industry: "Metal fabrication",
      companyDescription: "Sheet metal for industrial clients.",
      goalPrimary: FREE_DEFAULT_GOAL,
      timeConsumingWorkflows: FREE_DEFAULT_WORKFLOWS,
      currentAiUse: FREE_DEFAULT_AI_USE,
    });
  });

  it("never overwrites what the visitor typed", () => {
    const done = completeFreeScannerValues(
      { ...site, companyName: "My Name", goalPrimary: "Win more bids" },
      draft,
    );
    expect(done.companyName).toBe("My Name");
    expect(done.goalPrimary).toBe("Win more bids");
    expect(done.industry).toBe("Metal fabrication");
  });

  it("falls back to the hostname for the name and leaves the description empty without a draft", () => {
    const done = completeFreeScannerValues(site, null);
    expect(done.companyName).toBe("redwoodfab.example.com");
    expect(done.companyDescription).toBe("");
  });
});

describe("submitFreeScannerIntake with only a website", () => {
  const draft = {
    companyName: "Redwood Fab",
    industry: "Metal fabrication",
    companyDescription: "Sheet metal for industrial clients.",
  };
  const run = (overrides: Partial<FreeScannerIntakeValues> = {}) =>
    submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      buildFormData({
        companyName: "",
        industry: "",
        companyDescription: "",
        goalPrimary: "",
        timeConsumingWorkflows: "",
        currentAiUse: "",
        ...overrides,
      }),
    );

  beforeEach(() => {
    headersMock.mockResolvedValue(
      new Headers({ origin: "https://oppscan.e3d.ai", host: "oppscan.e3d.ai" }),
    );
    securityMocks.isTrustedServerActionOrigin.mockReturnValue(true);
    rateLimitMocks.isFreeAnalysisRateLimited.mockReturnValue(false);
    securityMocks.verifyTurnstileToken.mockResolvedValue(true);
    analysisMocks.generateFreeScannerCandidates.mockResolvedValue(rankScannerCandidates(candidates));
    profileMocks.fetchSiteProfileDraft.mockResolvedValue(draft);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads the site and analyzes with the drafted fields plus neutral defaults", async () => {
    const result = await run();
    expect(result.status).toBe("success");
    expect(profileMocks.fetchSiteProfileDraft).toHaveBeenCalledOnce();
    expect(profileMocks.fetchSiteProfileDraft.mock.calls[0][0]).toBe("https://redwoodfab.example.com");
    const analyzed = analysisMocks.generateFreeScannerCandidates.mock.calls[0][0];
    expect(analyzed).toMatchObject({
      companyName: "Redwood Fab",
      industry: "Metal fabrication",
      companyDescription: "Sheet metal for industrial clients.",
      goalPrimary: FREE_DEFAULT_GOAL,
    });
  });

  it("keeps what the visitor typed and only reads the site for the blanks", async () => {
    const result = await run({ companyDescription: "We weld brackets." });
    expect(result.status).toBe("success");
    expect(profileMocks.fetchSiteProfileDraft).toHaveBeenCalledOnce();
    const analyzed = analysisMocks.generateFreeScannerCandidates.mock.calls[0][0];
    expect(analyzed.companyDescription).toBe("We weld brackets.");
    expect(analyzed.companyName).toBe("Redwood Fab");
  });

  it("does not read the site at all when name, industry and description are all given", async () => {
    const result = await submitFreeScannerIntake(
      { status: "idle", values: emptyFreeScannerIntakeValues, errors: {} },
      buildFormData(),
    );
    expect(result.status).toBe("success");
    expect(profileMocks.fetchSiteProfileDraft).not.toHaveBeenCalled();
  });

  it("asks for one sentence when the site cannot be read and nothing was typed", async () => {
    profileMocks.fetchSiteProfileDraft.mockRejectedValue(new Error("blocked"));
    const result = await run();
    expect(result.status).toBe("error");
    expect(result.errors.companyDescription).toBe(FREE_PROFILE_UNAVAILABLE_MESSAGE);
    expect(analysisMocks.generateFreeScannerCandidates).not.toHaveBeenCalled();
  });

  it("proceeds without the site when the visitor supplied the description themselves", async () => {
    profileMocks.fetchSiteProfileDraft.mockRejectedValue(new Error("blocked"));
    const result = await run({ companyDescription: "We weld brackets." });
    expect(result.status).toBe("success");
    const analyzed = analysisMocks.generateFreeScannerCandidates.mock.calls[0][0];
    expect(analyzed.companyDescription).toBe("We weld brackets.");
    expect(analyzed.companyName).toBe("redwoodfab.example.com");
  });
});
