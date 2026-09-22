// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Archivo: () => ({ variable: "font-archivo" }),
  IBM_Plex_Mono: () => ({ variable: "font-plex-mono" }),
  Inter: () => ({ variable: "font-inter" }),
}));

import RootLayout from "../app/layout";
import ScannerPage from "../app/page";
import ReadinessScorePage, {
  generateMetadata as generateReadinessMetadata,
} from "../app/readiness-score/page";
import sitemap from "../app/sitemap";
import { ReadinessScoreForm } from "@/components/readiness-score-form";
import * as scannerPayments from "@/lib/scanner-payments";
import { getCanonicalUrl } from "@/lib/seo";
import {
  emptyReadinessScoreValues,
  resolveReadinessScoreBand,
  validateReadinessScoreFormData,
  type ReadinessScoreFormState,
} from "@/lib/readiness-score";

import { submitReadinessScore } from "../app/readiness-score/actions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function appendValidAnswers(formData: FormData) {
  formData.append("toolAdoption", "1");
  formData.append("processIntegration", "2");
  formData.append("dataReadiness", "3");
  formData.append("technicalCapacity", "4");
  formData.append("governance", "5");
}

describe("readiness score helpers and action", () => {
  it("parses a complete valid submission into a ScannerMaturity payload", () => {
    const formData = new FormData();
    appendValidAnswers(formData);

    const validation = validateReadinessScoreFormData(formData);

    expect(validation).toMatchObject({
      isValid: true,
      values: {
        toolAdoption: "1",
        processIntegration: "2",
        dataReadiness: "3",
        technicalCapacity: "4",
        governance: "5",
      },
      maturity: {
        toolAdoption: 1,
        processIntegration: 2,
        dataReadiness: 3,
        technicalCapacity: 4,
        governance: 5,
      },
    });
  });

  it("classifies missing, malformed, fractional, duplicated, and out-of-range values", () => {
    const invalidCases = [
      {
        name: "missing",
        build: () => {
          const formData = new FormData();
          formData.append("processIntegration", "2");
          formData.append("dataReadiness", "3");
          formData.append("technicalCapacity", "4");
          formData.append("governance", "5");
          return formData;
        },
        key: "toolAdoption",
        message: "Select one option for this area.",
      },
      {
        name: "malformed",
        build: () => {
          const formData = new FormData();
          appendValidAnswers(formData);
          formData.set("toolAdoption", "high");
          return formData;
        },
        key: "toolAdoption",
        message: "Submit a whole-number answer for this area.",
      },
      {
        name: "fractional",
        build: () => {
          const formData = new FormData();
          appendValidAnswers(formData);
          formData.set("toolAdoption", "3.5");
          return formData;
        },
        key: "toolAdoption",
        message: "Choose one whole-number level from 1 to 5.",
      },
      {
        name: "duplicated",
        build: () => {
          const formData = new FormData();
          appendValidAnswers(formData);
          formData.append("toolAdoption", "4");
          return formData;
        },
        key: "toolAdoption",
        message: "Submit exactly one value for this area.",
      },
      {
        name: "out-of-range",
        build: () => {
          const formData = new FormData();
          appendValidAnswers(formData);
          formData.set("toolAdoption", "6");
          return formData;
        },
        key: "toolAdoption",
        message: "Choose a level from 1 to 5.",
      },
    ] as const;

    for (const testCase of invalidCases) {
      const validation = validateReadinessScoreFormData(testCase.build());
      expect(validation.isValid, testCase.name).toBe(false);
      if (!validation.isValid) {
        expect(validation.errors[testCase.key]).toBe(testCase.message);
      }
    }
  });

  it("maps all documented score-band boundaries inclusively", () => {
    expect(resolveReadinessScoreBand(0)?.name).toBe("Early");
    expect(resolveReadinessScoreBand(40)?.name).toBe("Early");
    expect(resolveReadinessScoreBand(41)?.name).toBe("Developing");
    expect(resolveReadinessScoreBand(70)?.name).toBe("Developing");
    expect(resolveReadinessScoreBand(71)?.name).toBe("Advanced");
    expect(resolveReadinessScoreBand(100)?.name).toBe("Advanced");
  });

  it("returns deterministic scoring results and preserves valid selections on invalid submissions", async () => {
    const valid = new FormData();
    appendValidAnswers(valid);

    const success = await submitReadinessScore(
      {
        status: "idle",
        values: emptyReadinessScoreValues,
        errors: {},
      },
      valid,
    );

    expect(success).toMatchObject({
      status: "success",
      values: {
        toolAdoption: "1",
        processIntegration: "2",
        dataReadiness: "3",
        technicalCapacity: "4",
        governance: "5",
      },
      result: {
        score: 50,
        band: expect.objectContaining({ name: "Developing" }),
      },
    });

    const invalid = new FormData();
    invalid.append("toolAdoption", "4");
    invalid.append("processIntegration", "2");
    invalid.append("dataReadiness", "oops");
    invalid.append("technicalCapacity", "6");
    invalid.append("governance", "5");

    const failure = await submitReadinessScore(
      {
        status: "idle",
        values: emptyReadinessScoreValues,
        errors: {},
      },
      invalid,
    );

    expect(failure).toMatchObject({
      status: "error",
      values: {
        toolAdoption: "4",
        processIntegration: "2",
        dataReadiness: "",
        technicalCapacity: "",
        governance: "5",
      },
      errors: expect.objectContaining({
        form: expect.stringContaining("Review the highlighted fields"),
        dataReadiness: "Submit a whole-number answer for this area.",
        technicalCapacity: "Choose a level from 1 to 5.",
      }),
    });
    expect("result" in failure && failure.result).toBeFalsy();
  });
});

describe("readiness score route and discovery", () => {
  it("renders the calculator page with five dropdowns and no free-summary intake fields", () => {
    render(createElement(ReadinessScorePage));

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /check your ai readiness in under a minute/i,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/free, instant ai readiness self-assessment/i)).toBeTruthy();
    expect(screen.getAllByText(/no account/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("combobox")).toHaveLength(5);
    expect(screen.getByLabelText(/ai tool adoption/i)).toBeTruthy();
    expect(screen.getByLabelText(/process integration/i)).toBeTruthy();
    expect(screen.getByLabelText(/data readiness/i)).toBeTruthy();
    expect(screen.getByLabelText(/technical capacity/i)).toBeTruthy();
    expect(screen.getByLabelText(/governance/i)).toBeTruthy();
    expect(screen.queryByLabelText(/company website/i)).toBeNull();
    expect(screen.queryByText(/analyze my site/i)).toBeNull();
    expect(screen.queryByLabelText(/bot protection/i)).toBeNull();
  });

  it("publishes canonical metadata for the readiness score route", () => {
    const metadata = generateReadinessMetadata();

    expect(metadata.title).toBe("Free AI Readiness Score | Oppscan");
    expect(metadata.alternates?.canonical).toBe(getCanonicalUrl("/readiness-score"));
    expect(metadata.description).toContain("free, instant AI readiness self-assessment");
  });

  it("renders the result state and paid scan CTA without introducing opportunity content", () => {
    const band = resolveReadinessScoreBand(50);
    if (!band) {
      throw new Error("Expected band for score 50");
    }

    const successState: ReadinessScoreFormState = {
      status: "success",
      values: {
        toolAdoption: "1",
        processIntegration: "2",
        dataReadiness: "3",
        technicalCapacity: "4",
        governance: "5",
      },
      errors: {},
      result: {
        score: 50,
        band,
      },
    };

    render(
      createElement(ReadinessScoreForm, {
        action: async () => successState,
        initialState: successState,
      }),
    );

    expect(screen.getByText("50/100")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Developing" })).toBeTruthy();
    expect(screen.getAllByText(/quick self-assessment/i).length).toBeGreaterThan(0);
    const cta = screen.getByRole("link", {
      name: /see your specific opportunities — unlock the \$99 scan/i,
    });
    expect(cta.getAttribute("href")).toBe("/");
    expect(screen.queryByText(/top ai opportunities/i)).toBeNull();
  });

  it("exposes readiness-score links in the shared header, homepage, and sitemap while keeping /free", async () => {
    const layoutMarkup = renderToStaticMarkup(
      RootLayout({
        children: createElement("main", null, "Test"),
      }),
    );

    expect(layoutMarkup).toContain('href="/readiness-score"');
    expect(layoutMarkup).toContain('href="/free"');

    vi.spyOn(scannerPayments, "getScannerOffer").mockResolvedValue({
      product: "scanner",
      displayName: "AI Opportunity Scanner",
      pack: {
        id: "single",
        name: "AI Opportunity Scan",
        description: "1 AI opportunity scan report + consultation",
        credits: 500,
        amountUsdCents: 9900,
        currency: "usd",
      },
      formattedPrice: "$99.00",
    });

    const page = await ScannerPage({ searchParams: Promise.resolve({}) });
    const homepageMarkup = renderToStaticMarkup(page);

    expect(homepageMarkup).toContain('href="/readiness-score"');
    expect(homepageMarkup).toContain("Take the instant readiness score");
    expect(homepageMarkup).toContain('href="/free"');
    expect(homepageMarkup).toContain("Get a tailored free opportunity summary");

    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(getCanonicalUrl("/readiness-score"));
    expect(urls).toContain(getCanonicalUrl("/free"));
  });
});
