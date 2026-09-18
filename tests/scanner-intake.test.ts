import { createElement } from "react";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const paymentsMocks = vi.hoisted(() => ({
  claimScannerSessionCreditKey: vi.fn(),
  getScannerBalance: vi.fn(),
  getScannerCheckoutContext: vi.fn(),
  spendScannerIntakeCredit: vi.fn(),
}));
const deliveryMocks = vi.hoisted(() => ({
  deliverScannerIntakeSubmission: vi.fn(),
}));
const securityMocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
  isTrustedServerActionOrigin: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));
const analysisMocks = vi.hoisted(() => ({ generateScannerAnalysis: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/lib/scanner-payments", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scanner-payments")>(
    "@/lib/scanner-payments",
  );
  return {
    ...actual,
    ...paymentsMocks,
  };
});
vi.mock("@/lib/scanner-intake-delivery", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/scanner-intake-delivery")
  >("@/lib/scanner-intake-delivery");
  return {
    ...actual,
    ...deliveryMocks,
  };
});
vi.mock("@/lib/contact-security", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contact-security")>(
    "@/lib/contact-security",
  );
  return {
    ...actual,
    ...securityMocks,
  };
});
vi.mock("@/lib/scanner-analysis", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scanner-analysis")>(
    "@/lib/scanner-analysis",
  );
  return { ...actual, ...analysisMocks };
});

import ScannerIntakePage, {
  generateMetadata as generateScannerIntakeMetadata,
} from "../app/intake/page";
import { ScannerIntakeForm } from "@/components/scanner-intake-form";
import { scannerContent } from "@/content/scanner-content";
import { INTAKE_FIELDS } from "@/lib/scanner-intake-fields";
import {
  emptyScannerIntakeFormValues,
  maskEmailAddress,
  type ScannerIntakeFormValues,
  scannerIntakeValuesFromFormData,
  type ScannerIntakeFormState,
  validateScannerIntakeFormValues,
} from "@/lib/scanner-intake";
import {
  emptyScannerIntakeEnrichment,
  type ScannerIntakeEnrichmentInput,
} from "@/lib/scanner-intake-prefill";
import { getCanonicalUrl } from "@/lib/seo";
import {
  InMemoryScannerReportStore,
  buildReportUrl,
  deriveScanId,
  hashReportAccessToken,
  setScannerReportStoreForTests,
} from "@/lib/scanner-report-store";
import { setScannerTelemetrySinkForTests } from "@/lib/scanner-telemetry";

import { POST as scannerStatus } from "../app/api/scanner-intake/status/route";
import {
  orchestrateScannerIntake,
  submitScannerIntakeForm,
} from "../app/intake/actions";

const validValues = {
  ...emptyScannerIntakeFormValues,
  creditKey: "e3d_scanner_pay_test",
  companyName: "FutCo",
  companyWebsite: "futco.ai",
  industry: "Consulting",
  companyDescription: "We help operators deploy AI systems.",
  businessModel: "B2B advisory and implementation retainers.",
  headcount: "12 people across delivery, engineering, and operations.",
  productsServices: "AI consulting, system builds, and implementation support.",
  customerSegments: "SMBs and owner-led teams in North America.",
  goalPrimary: "Improve delivery speed",
  goalSecondary: "Reduce repetitive analysis",
  ninetyDayWin:
    "Cut proposal assembly time in half with reviewable automation.",
  statusQuoCost:
    "Senior operators spend too many hours on repetitive synthesis.",
  currentAiUse: "ChatGPT and Claude for internal drafts",
  aiToolsInUse: "ChatGPT Team and GitHub Copilot",
  pastAiAttempts:
    "A chatbot pilot stalled because source material stayed messy.",
  coreBusinessSystems: "HubSpot, Gmail, Docs, Notion, Linear",
  dataLocations: "Google Drive, HubSpot, Notion, and a Postgres database",
  dataSensitivity:
    "Customer data should stay out of third-party AI tools unless approved.",
  deliveryEmail: "buyer@example.com",
  companyLinkedin: "https://linkedin.com/company/futco-ai",
  goalTertiary: "Increase retained margin",
  acquisitionChannels: "Referrals, content, and partner introductions.",
  competitiveDifferentiation:
    "Hands-on operators who also build and maintain systems.",
  founderLinkedin: "https://www.linkedin.com/in/chris-futco/",
  overloadedRoles:
    "Delivery leads and founders are carrying too much context switching.",
  technicalCapacity:
    "Three engineers, one technical operator, and fractional IT support.",
  aiSkillLevel: "Power users with a few working automations.",
  timeConsumingWorkflows: "Proposal drafting and intake review",
  repetitiveTasks: "Weekly summaries, CRM updates, and follow-up drafting.",
  errorProneAreas: "Data handoffs between CRM, docs, and project tracking.",
  workflowSample:
    "A redacted client summary that currently takes 90 minutes to assemble.",
  workflowSampleLink: "https://loom.com/share/futco-workflow",
  hostingCloud: "AWS with some vendor-managed SaaS tools.",
  changeConstraints: "Busy client weeks limit rollout windows.",
  budgetRange: "$15k-$30k for the first implementation.",
  schedulingTimezone: "America/Los_Angeles",
  schedulingWindows: "Tue 10am PT, Wed 2pm PT, Thu 11am PT",
  constraints: "Union-sensitive client teams require careful rollout planning.",
};

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;
type ScannerIntakeFieldDriftGuard = Expect<
  Equal<keyof ScannerIntakeFormValues, (typeof INTAKE_FIELDS)[number]["key"]>
>;
const scannerIntakeFieldDriftGuard: ScannerIntakeFieldDriftGuard = true;
const require = createRequire(import.meta.url);
const { normalizeIntakeBody } = require(
  join(homedir(), "e3d/server/scannerIntakeNotifyRoutes.js"),
) as {
  normalizeIntakeBody: (
    body: unknown,
  ) =>
    | { ok: true; record: Record<string, unknown> }
    | { ok: false; error: string };
};

describe("Phase 5 scanner intake acceptance", () => {
  beforeEach(() => {
    setScannerReportStoreForTests(new InMemoryScannerReportStore());
    vi.stubEnv(
      "SCANNER_REPORT_TOKEN_SECRET",
      "test-scanner-report-token-secret-32-bytes",
    );
    analysisMocks.generateScannerAnalysis.mockResolvedValue(
      buildAnalysisResult(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    headersMock.mockReset();
    paymentsMocks.claimScannerSessionCreditKey.mockReset();
    paymentsMocks.getScannerBalance.mockReset();
    paymentsMocks.getScannerCheckoutContext.mockReset();
    paymentsMocks.spendScannerIntakeCredit.mockReset();
    deliveryMocks.deliverScannerIntakeSubmission.mockReset();
    securityMocks.isRateLimited.mockReset();
    securityMocks.isTrustedServerActionOrigin.mockReset();
    securityMocks.verifyTurnstileToken.mockReset();
    analysisMocks.generateScannerAnalysis.mockReset();
    setScannerReportStoreForTests(undefined);
    setScannerTelemetrySinkForTests(undefined);
  });

  it("renders the intake route metadata and the expanded core and deep-dive form sections", async () => {
    const page = await ScannerIntakePage({
      searchParams: Promise.resolve({ stripe_session_id: "cs_test_123" }),
    });
    const idleState = {
      status: "idle",
      values: validValues,
      errors: {},
    } satisfies ScannerIntakeFormState;
    const pageMarkup = renderToStaticMarkup(page);
    const formMarkup = renderToStaticMarkup(
      createElement(ScannerIntakeForm, {
        action: async () => idleState,
        initialState: idleState,
        initialVerifiedAccess: {
          creditKey: validValues.creditKey,
          checkoutEmailHint: "b***r@example.com",
          credits: 500,
        },
      }),
    );

    expect(pageMarkup).toContain(scannerContent.intakePage.heading);
    expect(pageMarkup).toContain("Payment key");
    expect(formMarkup).toContain("Company");
    expect(formMarkup).toContain("Company name");
    expect(formMarkup).toContain("Company website");
    expect(formMarkup).toContain(
      "How do you make money? (B2B / B2C / marketplace..., main revenue streams)",
    );
    expect(formMarkup).toContain("Top business goal 1");
    expect(formMarkup).toContain(
      "What a meaningful AI win looks like in the next 90 days",
    );
    expect(formMarkup).toContain(
      "Which workflows consume the most time right now?",
    );
    expect(formMarkup).toContain("Core business systems");
    expect(formMarkup).toContain("Report email");
    expect(formMarkup).toContain(
      "Optional — the more you share, the sharper the scan",
    );
    expect(formMarkup).toContain("<details");
    expect(formMarkup).toContain('value="FutCo"');
    expect(formMarkup).toContain("If you click Analyze my site");

    const metadata = generateScannerIntakeMetadata();
    expect(metadata.alternates?.canonical).toBe(
      getCanonicalUrl("/intake"),
    );
  });

  it("validates and normalizes intake fields including the website and checkout email hint", () => {
    const result = validateScannerIntakeFormValues({
      ...validValues,
      companyLinkedin: "linkedin.com/company/futco-ai",
      workflowSampleLink: "loom.com/share/futco-workflow",
    });

    expect(result.isValid).toBe(true);
    expect(result.values.companyWebsite).toBe("https://futco.ai");
    expect(result.values.companyLinkedin).toBe(
      "https://linkedin.com/company/futco-ai",
    );
    expect(result.values.workflowSampleLink).toBe(
      "https://loom.com/share/futco-workflow",
    );
    expect(maskEmailAddress("buyer@example.com")).toBe("b***r@example.com");
  });

  it("keeps the intake descriptor list aligned with the Phase 2 field set", () => {
    expect(scannerIntakeFieldDriftGuard).toBe(true);
    expect(INTAKE_FIELDS.map((field) => field.key)).toEqual([
      "creditKey",
      "companyName",
      "companyWebsite",
      "industry",
      "companyDescription",
      "businessModel",
      "headcount",
      "productsServices",
      "customerSegments",
      "goalPrimary",
      "goalSecondary",
      "ninetyDayWin",
      "statusQuoCost",
      "timeConsumingWorkflows",
      "currentAiUse",
      "aiToolsInUse",
      "pastAiAttempts",
      "coreBusinessSystems",
      "dataLocations",
      "dataSensitivity",
      "deliveryEmail",
      "companyLinkedin",
      "goalTertiary",
      "acquisitionChannels",
      "competitiveDifferentiation",
      "founderLinkedin",
      "overloadedRoles",
      "technicalCapacity",
      "aiSkillLevel",
      "repetitiveTasks",
      "errorProneAreas",
      "workflowSample",
      "workflowSampleLink",
      "hostingCloud",
      "changeConstraints",
      "budgetRange",
      "schedulingTimezone",
      "schedulingWindows",
      "constraints",
      "website",
      "turnstileToken",
    ]);
    expect(
      INTAKE_FIELDS.filter((field) => field.required).map((field) => field.key),
    ).toEqual([
      "creditKey",
      "companyName",
      "companyWebsite",
      "industry",
      "companyDescription",
      "businessModel",
      "headcount",
      "productsServices",
      "customerSegments",
      "goalPrimary",
      "goalSecondary",
      "ninetyDayWin",
      "statusQuoCost",
      "timeConsumingWorkflows",
      "currentAiUse",
      "aiToolsInUse",
      "pastAiAttempts",
      "coreBusinessSystems",
      "dataLocations",
      "dataSensitivity",
      "deliveryEmail",
    ]);
  });

  it("keeps ScannerIntakeFormValues keys exactly aligned with INTAKE_FIELDS", () => {
    expect(Object.keys(emptyScannerIntakeFormValues)).toEqual(
      INTAKE_FIELDS.map((field) => field.key),
    );
  });

  it("rejects blank A1 required fields and allows blank A2 deep-dive fields", () => {
    const requiredMessages = {
      creditKey: "Enter the payment key from checkout.",
      companyName: "Company name is required.",
      companyWebsite: "Company website is required.",
      industry: "Industry is required.",
      companyDescription: "Company description is required.",
      businessModel: "Describe how the company makes money.",
      headcount: "Team size is required.",
      productsServices: "Describe the primary products or services.",
      customerSegments: "Describe who your customers are.",
      goalPrimary: "Add your first business goal.",
      goalSecondary: "Add your second business goal.",
      ninetyDayWin: "Describe the 90-day AI win you want.",
      statusQuoCost: "Describe what the status quo is costing.",
      timeConsumingWorkflows:
        "Describe the workflows that consume the most time.",
      currentAiUse: "Describe how AI is used today.",
      aiToolsInUse: "List the AI tools or subscriptions already in use.",
      pastAiAttempts: "Describe any AI attempts that stalled or failed.",
      coreBusinessSystems: "Describe the core business systems in use.",
      dataLocations: "Describe where business data lives.",
      dataSensitivity:
        "Describe any data sensitivity or regulated constraints.",
      deliveryEmail: "Report email is required.",
    } as const;

    for (const field of INTAKE_FIELDS) {
      const values = { ...validValues, [field.key]: "" };
      const result = validateScannerIntakeFormValues(values);

      if (field.required) {
        expect(result.isValid, field.key).toBe(false);
        expect(result.errors[field.key], field.key).toBe(
          requiredMessages[field.key as keyof typeof requiredMessages],
        );
      } else {
        expect(result.errors[field.key], field.key).toBeUndefined();
      }
    }
  });

  it("preserves max-length validation for every current intake field", () => {
    for (const field of INTAKE_FIELDS) {
      const result = validateScannerIntakeFormValues({
        ...validValues,
        [field.key]: "x".repeat(field.maxLength + 1),
      });

      expect(result.errors[field.key], field.key).toBe(
        `Keep this response under ${field.maxLength} characters.`,
      );
    }
  });

  it("validates the report email, company website, and the three optional URL fields", () => {
    const invalidEmail = validateScannerIntakeFormValues({
      ...validValues,
      deliveryEmail: "not-an-email",
    });
    expect(invalidEmail.errors.deliveryEmail).toBe(
      "Enter a valid email address.",
    );

    const invalidWebsite = validateScannerIntakeFormValues({
      ...validValues,
      companyWebsite: "not a website",
    });
    expect(invalidWebsite.errors.companyWebsite).toBe(
      "Enter a valid website URL.",
    );

    const httpWebsite = validateScannerIntakeFormValues({
      ...validValues,
      companyWebsite: "http://futco.ai",
    });
    expect(httpWebsite.errors.companyWebsite).toBeUndefined();

    const invalidCompanyLinkedin = validateScannerIntakeFormValues({
      ...validValues,
      companyLinkedin: "not a url",
    });
    expect(invalidCompanyLinkedin.errors.companyLinkedin).toBe(
      "Enter a valid URL.",
    );

    const invalidFounderLinkedin = validateScannerIntakeFormValues({
      ...validValues,
      founderLinkedin: "still not a url",
    });
    expect(invalidFounderLinkedin.errors.founderLinkedin).toBe(
      "Enter a valid URL.",
    );

    const invalidWorkflowSampleLink = validateScannerIntakeFormValues({
      ...validValues,
      workflowSampleLink: "bad link",
    });
    expect(invalidWorkflowSampleLink.errors.workflowSampleLink).toBe(
      "Enter a valid URL.",
    );

    const blankOptionalUrls = validateScannerIntakeFormValues({
      ...validValues,
      companyLinkedin: "",
      founderLinkedin: "",
      workflowSampleLink: "",
    });
    expect(blankOptionalUrls.errors.companyLinkedin).toBeUndefined();
    expect(blankOptionalUrls.errors.founderLinkedin).toBeUndefined();
    expect(blankOptionalUrls.errors.workflowSampleLink).toBeUndefined();
  });

  it("reads intake form data from descriptor keys and honors the turnstile response alias", () => {
    const formData = buildFormData({
      ...validValues,
      turnstileToken: "hidden-turnstile-token",
    });
    formData.set("cf-turnstile-response", "turnstile-response-token");

    const parsed = scannerIntakeValuesFromFormData(formData);

    expect(parsed).toEqual({
      ...validValues,
      website: "",
      turnstileToken: "turnstile-response-token",
    });
  });

  it("returns honeypot fake success before rate limiting or scanner work", async () => {
    headersMock.mockResolvedValue(
      new Headers({
        origin: "https://oppscan.e3d.ai",
        host: "oppscan.e3d.ai",
      }),
    );
    securityMocks.isTrustedServerActionOrigin.mockReturnValue(true);

    const result = await submitScannerIntakeForm(
      {
        status: "idle",
        values: emptyScannerIntakeFormValues,
        errors: {},
      },
      buildFormData({ website: "filled-by-bot" }),
    );

    expect(result.status).toBe("success");
    expect(result.reportUrl).toBeUndefined();
    expect(securityMocks.isRateLimited).not.toHaveBeenCalled();
    expect(paymentsMocks.getScannerBalance).not.toHaveBeenCalled();
    expect(deliveryMocks.deliverScannerIntakeSubmission).not.toHaveBeenCalled();
    expect(analysisMocks.generateScannerAnalysis).not.toHaveBeenCalled();
  });

  it("uses the payments API for balance, checkout context, session claim, and spend", async () => {
    const actualPayments = await vi.importActual<
      typeof import("@/lib/scanner-payments")
    >("@/lib/scanner-payments");
    vi.stubEnv("E3D_API_BASE_URL", "https://payments.example.com/api");
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "scanner-internal");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ product: "scanner", credits: 500 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            product: "scanner",
            customerEmail: "buyer@example.com",
            stripeSessionId: "cs_test_123",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "completed",
            creditKey: validValues.creditKey,
            issuedCredits: 500,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            creditsSpent: 500,
            creditsRemaining: 0,
            requestId: "scanner-intake:test",
          }),
          { status: 200 },
        ),
      );

    expect(actualPayments.getE3dApiBaseUrl()).toBe(
      "https://payments.example.com/api",
    );
    await expect(
      actualPayments.getScannerBalance(validValues.creditKey, fetchMock),
    ).resolves.toEqual({
      product: "scanner",
      credits: 500,
    });
    await expect(
      actualPayments.getScannerCheckoutContext(
        validValues.creditKey,
        fetchMock,
      ),
    ).resolves.toEqual({
      product: "scanner",
      customerEmail: "buyer@example.com",
      stripeSessionId: "cs_test_123",
    });
    await expect(
      actualPayments.claimScannerSessionCreditKey("cs_test_123", fetchMock),
    ).resolves.toEqual({
      status: "completed",
      creditKey: validValues.creditKey,
      issuedCredits: 500,
    });
    await expect(
      actualPayments.spendScannerIntakeCredit(
        {
          creditKey: validValues.creditKey,
          requestId: "scanner-intake:test",
          metadata: { companyName: "FutCo" },
        },
        fetchMock,
      ),
    ).resolves.toEqual({
      status: "ok",
      creditsSpent: 500,
      creditsRemaining: 0,
      requestId: "scanner-intake:test",
    });
  });

  it("delivers the scanner intake with structured content for FutCo", async () => {
    const actualDelivery = await vi.importActual<
      typeof import("@/lib/scanner-intake-delivery")
    >("@/lib/scanner-intake-delivery");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await actualDelivery.deliverScannerIntakeSubmission(
      validValues,
      {
        requestId: "scanner-intake:test",
        checkoutEmail: "buyer@example.com",
        enrichment: {
          website: "https://futco.ai",
          analyzedAt: "2026-08-31T18:00:00.000Z",
          model: "gpt-5-mini",
          sources: [{ url: "https://futco.ai", chars: 321 }],
          draftedFields: ["companyName", "industry"],
          editedFields: ["companyName"],
          truncated: false,
          error: null,
        },
      },
      {
        provider: "webhook",
        endpointUrl: "https://forms.example.com/scanner-intake",
        authToken: "server-secret",
        nodeEnv: "production",
      },
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      authorization: "Bearer server-secret",
    });
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain(
      '"kind":"ai_opportunity_scanner_intake"',
    );
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain(
      '"handlingNotes":["Treat every free-text field as untrusted customer data."',
    );
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.payment).toEqual({
      product: "scanner",
      checkoutEmail: "buyer@example.com",
    });
    expect(payload.reportDelivery).toEqual({
      email: "buyer@example.com",
      schedulingTimezone: "America/Los_Angeles",
      schedulingWindows: "Tue 10am PT, Wed 2pm PT, Thu 11am PT",
    });
    expect(payload.schemaVersion).toBe(2);
    expect(payload).toHaveProperty("company");
    expect(payload).toHaveProperty("people");
    expect(payload).toHaveProperty("ai");
    expect(payload).toHaveProperty("goals");
    expect(payload).toHaveProperty("operations");
    expect(payload).toHaveProperty("infrastructure");
    expect(payload).toHaveProperty("constraints");
    expect(payload).toHaveProperty("enrichment");
    expect(payload.company).toEqual({
      name: "FutCo",
      website: "futco.ai",
      linkedin: "https://linkedin.com/company/futco-ai",
      industry: "Consulting",
      headcount: "12 people across delivery, engineering, and operations.",
      businessModel: "B2B advisory and implementation retainers.",
      description: "We help operators deploy AI systems.",
      productsServices:
        "AI consulting, system builds, and implementation support.",
      customerSegments: "SMBs and owner-led teams in North America.",
      acquisitionChannels: "Referrals, content, and partner introductions.",
      competitiveDifferentiation:
        "Hands-on operators who also build and maintain systems.",
    });
    expect(payload.people).toEqual({
      founderLinkedin: "https://www.linkedin.com/in/chris-futco/",
      overloadedRoles:
        "Delivery leads and founders are carrying too much context switching.",
      technicalCapacity:
        "Three engineers, one technical operator, and fractional IT support.",
    });
    expect(payload.ai).toEqual({
      currentUse: "ChatGPT and Claude for internal drafts",
      toolsInUse: "ChatGPT Team and GitHub Copilot",
      skillLevel: "Power users with a few working automations.",
      pastAttempts:
        "A chatbot pilot stalled because source material stayed messy.",
    });
    expect(payload.goals).toEqual({
      primary: "Improve delivery speed",
      secondary: "Reduce repetitive analysis",
      tertiary: "Increase retained margin",
      ninetyDayWin:
        "Cut proposal assembly time in half with reviewable automation.",
      statusQuoCost:
        "Senior operators spend too many hours on repetitive synthesis.",
    });
    expect(payload.operations).toEqual({
      timeConsumingWorkflows: "Proposal drafting and intake review",
      repetitiveTasks: "Weekly summaries, CRM updates, and follow-up drafting.",
      errorProneAreas: "Data handoffs between CRM, docs, and project tracking.",
      workflowSample:
        "A redacted client summary that currently takes 90 minutes to assemble.",
      workflowSampleLink: "https://loom.com/share/futco-workflow",
    });
    expect(payload.infrastructure).toEqual({
      coreBusinessSystems: "HubSpot, Gmail, Docs, Notion, Linear",
      dataLocations: "Google Drive, HubSpot, Notion, and a Postgres database",
      hostingCloud: "AWS with some vendor-managed SaaS tools.",
    });
    expect(payload.constraints).toEqual({
      dataSensitivity:
        "Customer data should stay out of third-party AI tools unless approved.",
      changeConstraints: "Busy client weeks limit rollout windows.",
      budgetRange: "$15k-$30k for the first implementation.",
      other: "Union-sensitive client teams require careful rollout planning.",
    });
    expect(payload.enrichment).toEqual({
      website: "https://futco.ai",
      analyzedAt: "2026-08-31T18:00:00.000Z",
      model: "gpt-5-mini",
      sources: [{ url: "https://futco.ai", chars: 321 }],
      draftedFields: ["companyName", "industry"],
      editedFields: ["companyName"],
      truncated: false,
      error: null,
    });
    expect(actualDelivery.getScannerIntakeDeliveryConfig().provider).toBe("");
  });

  it("delivers a full expanded-form v2 record with all-null enrichment when no prefill was used", async () => {
    const actualDelivery = await vi.importActual<
      typeof import("@/lib/scanner-intake-delivery")
    >("@/lib/scanner-intake-delivery");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await actualDelivery.deliverScannerIntakeSubmission(
      validValues,
      {
        requestId: "scanner-intake:no-prefill",
        checkoutEmail: "buyer@example.com",
      },
      {
        provider: "webhook",
        endpointUrl: "https://forms.example.com/scanner-intake",
        authToken: "server-secret",
        nodeEnv: "production",
      },
    );

    expect(result).toEqual({ ok: true });
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.schemaVersion).toBe(2);
    expect(payload.enrichment).toEqual(emptyScannerIntakeEnrichment);
    expect(payload.reportDelivery).toEqual({
      email: "buyer@example.com",
      schedulingTimezone: "America/Los_Angeles",
      schedulingWindows: "Tue 10am PT, Wed 2pm PT, Thu 11am PT",
    });
    expect(payload.company).toMatchObject({
      name: "FutCo",
      website: "futco.ai",
      linkedin: "https://linkedin.com/company/futco-ai",
      acquisitionChannels: "Referrals, content, and partner introductions.",
      competitiveDifferentiation:
        "Hands-on operators who also build and maintain systems.",
    });
    expect(payload.people).toEqual({
      founderLinkedin: "https://www.linkedin.com/in/chris-futco/",
      overloadedRoles:
        "Delivery leads and founders are carrying too much context switching.",
      technicalCapacity:
        "Three engineers, one technical operator, and fractional IT support.",
    });
    expect(payload.ai).toMatchObject({
      currentUse: "ChatGPT and Claude for internal drafts",
      toolsInUse: "ChatGPT Team and GitHub Copilot",
      skillLevel: "Power users with a few working automations.",
      pastAttempts:
        "A chatbot pilot stalled because source material stayed messy.",
    });
    expect(payload.goals).toMatchObject({
      primary: "Improve delivery speed",
      secondary: "Reduce repetitive analysis",
      tertiary: "Increase retained margin",
      ninetyDayWin:
        "Cut proposal assembly time in half with reviewable automation.",
      statusQuoCost:
        "Senior operators spend too many hours on repetitive synthesis.",
    });
    expect(payload.operations).toEqual({
      timeConsumingWorkflows: "Proposal drafting and intake review",
      repetitiveTasks: "Weekly summaries, CRM updates, and follow-up drafting.",
      errorProneAreas: "Data handoffs between CRM, docs, and project tracking.",
      workflowSample:
        "A redacted client summary that currently takes 90 minutes to assemble.",
      workflowSampleLink: "https://loom.com/share/futco-workflow",
    });
    expect(payload.infrastructure).toEqual({
      coreBusinessSystems: "HubSpot, Gmail, Docs, Notion, Linear",
      dataLocations: "Google Drive, HubSpot, Notion, and a Postgres database",
      hostingCloud: "AWS with some vendor-managed SaaS tools.",
    });
    expect(payload.constraints).toEqual({
      dataSensitivity:
        "Customer data should stay out of third-party AI tools unless approved.",
      changeConstraints: "Busy client weeks limit rollout windows.",
      budgetRange: "$15k-$30k for the first implementation.",
      other: "Union-sensitive client teams require careful rollout planning.",
    });
  });

  it("returns ok false for a non-ok scanner intake delivery response", async () => {
    const actualDelivery = await vi.importActual<
      typeof import("@/lib/scanner-intake-delivery")
    >("@/lib/scanner-intake-delivery");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      actualDelivery.deliverScannerIntakeSubmission(
        validValues,
        {
          requestId: "scanner-intake:test",
          checkoutEmail: "buyer@example.com",
        },
        {
          provider: "webhook",
          endpointUrl: "https://forms.example.com/scanner-intake",
          authToken: "server-secret",
          nodeEnv: "production",
        },
      ),
    ).resolves.toEqual({
      ok: false,
      message: "Scanner intake delivery failed. Please try again.",
    });
  });

  it("rejects a report email that does not match the Stripe checkout email", async () => {
    headersMock.mockResolvedValue(
      new Headers({
        origin: "https://oppscan.e3d.ai",
        host: "oppscan.e3d.ai",
        "x-forwarded-for": "127.0.0.1",
      }),
    );
    securityMocks.isTrustedServerActionOrigin.mockReturnValue(true);
    securityMocks.isRateLimited.mockReturnValue(false);
    securityMocks.verifyTurnstileToken.mockResolvedValue(true);
    paymentsMocks.getScannerBalance.mockResolvedValue({
      product: "scanner",
      credits: 500,
    });
    paymentsMocks.getScannerCheckoutContext.mockResolvedValue({
      product: "scanner",
      customerEmail: "paid@example.com",
      stripeSessionId: "cs_test_123",
    });

    const formData = buildFormData({
      ...validValues,
      deliveryEmail: "different@example.com",
    });
    const result = await submitScannerIntakeForm(
      {
        status: "idle",
        values: emptyScannerIntakeFormValues,
        errors: {},
      },
      formData,
    );

    expect(result.status).toBe("error");
    expect(result.errors.deliveryEmail).toBe(
      "The report email must match the email Stripe collected during checkout.",
    );
    expect(deliveryMocks.deliverScannerIntakeSubmission).not.toHaveBeenCalled();
    expect(paymentsMocks.spendScannerIntakeCredit).not.toHaveBeenCalled();
  });

  it("blocks submissions without balance and does not spend after a non-ok delivery", async () => {
    headersMock.mockResolvedValue(
      new Headers({
        origin: "https://oppscan.e3d.ai",
        host: "oppscan.e3d.ai",
        "x-forwarded-for": "127.0.0.1",
      }),
    );
    securityMocks.isTrustedServerActionOrigin.mockReturnValue(true);
    securityMocks.isRateLimited.mockReturnValue(false);
    securityMocks.verifyTurnstileToken.mockResolvedValue(true);
    paymentsMocks.getScannerCheckoutContext.mockResolvedValue({
      product: "scanner",
      customerEmail: "buyer@example.com",
      stripeSessionId: "cs_test_123",
    });

    paymentsMocks.getScannerBalance.mockResolvedValueOnce({
      product: "scanner",
      credits: 0,
    });

    const insufficient = await submitScannerIntakeForm(
      {
        status: "idle",
        values: emptyScannerIntakeFormValues,
        errors: {},
      },
      buildFormData(validValues),
    );

    expect(insufficient.status).toBe("error");
    expect(insufficient.errors.form).toBe(
      "This payment key does not have an unspent scanner credit available.",
    );

    paymentsMocks.getScannerBalance.mockResolvedValueOnce({
      product: "scanner",
      credits: 500,
    });

    const order: string[] = [];
    deliveryMocks.deliverScannerIntakeSubmission.mockImplementation(
      async () => {
        order.push("deliver");
        return {
          ok: false,
          message: "Scanner intake delivery failed. Please try again.",
        };
      },
    );

    const failedDelivery = await submitScannerIntakeForm(
      {
        status: "idle",
        values: emptyScannerIntakeFormValues,
        errors: {},
      },
      buildFormData(validValues),
    );

    expect(failedDelivery.status).toBe("error");
    expect(failedDelivery.errors.form).toBe(
      "Scanner intake delivery failed. Please try again.",
    );
    expect(paymentsMocks.spendScannerIntakeCredit).not.toHaveBeenCalled();

    paymentsMocks.getScannerBalance.mockResolvedValueOnce({
      product: "scanner",
      credits: 500,
    });
    deliveryMocks.deliverScannerIntakeSubmission.mockImplementation(
      async () => {
        order.push("deliver");
        return { ok: true };
      },
    );
    paymentsMocks.spendScannerIntakeCredit.mockImplementation(async () => {
      order.push("spend");
      return {
        status: "ok",
        creditsSpent: 500,
        creditsRemaining: 0,
        requestId: "scanner-intake:test",
      };
    });

    const successful = await submitScannerIntakeForm(
      {
        status: "idle",
        values: emptyScannerIntakeFormValues,
        errors: {},
      },
      buildFormData(validValues),
    );

    expect(successful.status).toBe("success");
    expect(successful.reportUrl).toMatch(
      /^\/report\/[A-Za-z0-9_-]+$/,
    );
    expect(order).toEqual(["deliver", "deliver", "spend"]);
    expect(paymentsMocks.getScannerBalance).toHaveBeenCalledTimes(3);
    expect(deliveryMocks.deliverScannerIntakeSubmission).toHaveBeenCalledTimes(
      2,
    );
    expect(paymentsMocks.spendScannerIntakeCredit).toHaveBeenCalledTimes(1);
    expect(paymentsMocks.spendScannerIntakeCredit).toHaveBeenCalledWith(
      expect.objectContaining({
        creditKey: validValues.creditKey,
        metadata: expect.objectContaining({
          companyName: "FutCo",
          deliveryEmail: "buyer@example.com",
          checkoutEmail: "buyer@example.com",
        }),
      }),
    );

    const reused = await submitScannerIntakeForm(
      {
        status: "idle",
        values: emptyScannerIntakeFormValues,
        errors: {},
      },
      buildFormData(validValues),
    );
    expect(reused.reportUrl).toBe(successful.reportUrl);
    expect(deliveryMocks.deliverScannerIntakeSubmission).toHaveBeenCalledTimes(
      2,
    );
    expect(paymentsMocks.spendScannerIntakeCredit).toHaveBeenCalledTimes(1);
    expect(analysisMocks.generateScannerAnalysis).toHaveBeenCalledTimes(1);
  });

  it("retries a settled spend after generation failure without another spend or webhook", async () => {
    configureSuccessfulPurchase();
    const telemetry = vi.fn();
    setScannerTelemetrySinkForTests(telemetry);
    analysisMocks.generateScannerAnalysis
      .mockRejectedValueOnce(new Error("provider detail must stay private"))
      .mockResolvedValueOnce(buildAnalysisResult());
    const store = new InMemoryScannerReportStore();
    setScannerReportStoreForTests(store);

    const first = await submitScannerIntakeForm(idleState(), buildFormData(validValues));
    expect(first).toMatchObject({ status: "error" });
    expect(await store.hasSettledSpend(deriveScanId(validValues.creditKey))).toBe(true);
    expect(await store.getByScanId(deriveScanId(validValues.creditKey))).toBeNull();

    const second = await submitScannerIntakeForm(idleState(), buildFormData(validValues));
    expect(second.reportUrl).toBe(buildReportUrl(deriveScanId(validValues.creditKey)));
    expect(paymentsMocks.spendScannerIntakeCredit).toHaveBeenCalledOnce();
    expect(deliveryMocks.deliverScannerIntakeSubmission).toHaveBeenCalledOnce();
    expect(analysisMocks.generateScannerAnalysis).toHaveBeenCalledTimes(2);
    expect(telemetry.mock.calls.map(([event]) => event.eventName)).toEqual([
      "scanner_analysis_started",
      "scanner_analysis_failed",
      "scanner_analysis_completed",
    ]);
    expect(telemetry.mock.calls[1][0]).toMatchObject({ failureCategory: "internal" });
    expect(JSON.stringify(telemetry.mock.calls)).not.toContain("provider detail");
  });

  it("fails before analysis when the settled marker or started claim cannot persist and releases the lease", async () => {
    configureSuccessfulPurchase();
    const scanId = deriveScanId(validValues.creditKey);
    const markerFailure = new InMemoryScannerReportStore();
    markerFailure.markSpendSettled = vi.fn().mockRejectedValue(new Error("store"));
    setScannerReportStoreForTests(markerFailure);
    const markerResult = await submitScannerIntakeForm(idleState(), buildFormData(validValues));
    expect(markerResult.status).toBe("error");
    expect(analysisMocks.generateScannerAnalysis).not.toHaveBeenCalled();
    expect(await markerFailure.hasSettledSpend(scanId)).toBe(false);
    expect(await markerFailure.acquireGenerationLease(scanId, "next-owner", Date.now(), Date.now() + 10)).toBe("acquired");

    analysisMocks.generateScannerAnalysis.mockClear();
    const claimFailure = new InMemoryScannerReportStore();
    await claimFailure.markSpendSettled(scanId, new Date().toISOString());
    claimFailure.claimTelemetryEvent = vi.fn().mockRejectedValue(new Error("store"));
    setScannerReportStoreForTests(claimFailure);
    const claimResult = await submitScannerIntakeForm(idleState(), buildFormData(validValues));
    expect(claimResult.status).toBe("error");
    expect(await claimFailure.hasSettledSpend(scanId)).toBe(true);
    expect(analysisMocks.generateScannerAnalysis).not.toHaveBeenCalled();
    expect(await claimFailure.acquireGenerationLease(scanId, "retry-owner", Date.now(), Date.now() + 10)).toBe("acquired");
  });

  it("serializes concurrent generation and lets a busy caller observe the winner", async () => {
    configureSuccessfulPurchase();
    const store = new InMemoryScannerReportStore();
    const acquire = vi.spyOn(store, "acquireGenerationLease");
    let releaseAnalysis!: (value: ReturnType<typeof buildAnalysisResult>) => void;
    analysisMocks.generateScannerAnalysis.mockImplementationOnce(
      () => new Promise((resolve) => { releaseAnalysis = resolve; }),
    );
    const first = orchestrateScannerIntake(validValues, buildFormData(validValues), {
      store,
      telemetrySink: vi.fn().mockRejectedValue(new Error("sink unavailable")),
      leaseWaitMs: 100,
      pollIntervalMs: 1,
    });
    await vi.waitFor(() => expect(analysisMocks.generateScannerAnalysis).toHaveBeenCalledOnce());
    const second = orchestrateScannerIntake(validValues, buildFormData(validValues), {
      store,
      leaseWaitMs: 100,
      pollIntervalMs: 1,
    });
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(2));
    releaseAnalysis(buildAnalysisResult());
    const [winner, waiter] = await Promise.all([first, second]);
    expect(winner.reportUrl).toBe(waiter.reportUrl);
    expect(analysisMocks.generateScannerAnalysis).toHaveBeenCalledOnce();
    expect(paymentsMocks.spendScannerIntakeCredit).toHaveBeenCalledOnce();
    expect(deliveryMocks.deliverScannerIntakeSubmission).toHaveBeenCalledOnce();
  });

  it("returns controlled retry for a busy lease and handles the acquire-complete race without work", async () => {
    const scanId = deriveScanId(validValues.creditKey);
    const busy = new InMemoryScannerReportStore();
    await busy.acquireGenerationLease(scanId, "other-owner", Date.now(), Date.now() + 10_000);
    const busyResult = await orchestrateScannerIntake(validValues, buildFormData(validValues), {
      store: busy,
      leaseWaitMs: 0,
    });
    expect(busyResult.status).toBe("error");
    expect(busyResult).not.toHaveProperty("reportUrl");

    const complete = new InMemoryScannerReportStore();
    await complete.acquireGenerationLease(scanId, "winner", 1, 100);
    const analysis = buildAnalysisResult();
    await complete.completeReport(scanId, "winner", analysis, "a".repeat(64), new Date().toISOString());
    const getByScanId = vi.spyOn(complete, "getByScanId").mockResolvedValueOnce(null);
    const raced = await orchestrateScannerIntake(validValues, buildFormData(validValues), { store: complete });
    expect(raced.reportUrl).toBe(buildReportUrl(scanId));
    expect(getByScanId).toHaveBeenCalledTimes(2);
    expect(paymentsMocks.spendScannerIntakeCredit).not.toHaveBeenCalled();
    expect(deliveryMocks.deliverScannerIntakeSubmission).not.toHaveBeenCalled();
    expect(analysisMocks.generateScannerAnalysis).not.toHaveBeenCalled();
  });

  it("unlocks status for credit, completed-report, and settled-spend paths but rejects an unmarked spent key", async () => {
    paymentsMocks.getScannerCheckoutContext.mockResolvedValue({
      product: "scanner", customerEmail: "buyer@example.com", stripeSessionId: "cs_test_123",
    });
    const scanId = deriveScanId(validValues.creditKey);
    const cases: Array<{ credits: number; prepare?: (store: InMemoryScannerReportStore) => Promise<void>; status: number }> = [
      { credits: 500, status: 200 },
      { credits: 0, prepare: (store) => store.markSpendSettled(scanId, new Date().toISOString()), status: 200 },
      { credits: 0, prepare: async (store) => {
        await store.acquireGenerationLease(scanId, "owner", 1, 100);
        await store.completeReport(scanId, "owner", buildAnalysisResult(), hashReportAccessToken("token"), new Date().toISOString());
      }, status: 200 },
      { credits: 0, status: 402 },
    ];
    for (const testCase of cases) {
      const store = new InMemoryScannerReportStore();
      if (testCase.prepare) await testCase.prepare(store);
      setScannerReportStoreForTests(store);
      paymentsMocks.getScannerBalance.mockResolvedValue({ product: "scanner", credits: testCase.credits });
      const response = await scannerStatus(new Request("https://oppscan.e3d.ai/api/scanner-intake/status", {
        method: "POST",
        body: JSON.stringify({ creditKey: validValues.creditKey }),
      }));
      expect(response.status).toBe(testCase.status);
      expect((await response.json()).eligible).toBe(testCase.status === 200);
    }
  });

  it("submits successfully even when prefill metadata indicates a failed analysis", async () => {
    headersMock.mockResolvedValue(
      new Headers({
        origin: "https://oppscan.e3d.ai",
        host: "oppscan.e3d.ai",
        "x-forwarded-for": "127.0.0.1",
      }),
    );
    securityMocks.isTrustedServerActionOrigin.mockReturnValue(true);
    securityMocks.isRateLimited.mockReturnValue(false);
    securityMocks.verifyTurnstileToken.mockResolvedValue(true);
    paymentsMocks.getScannerBalance.mockResolvedValue({
      product: "scanner",
      credits: 500,
    });
    paymentsMocks.getScannerCheckoutContext.mockResolvedValue({
      product: "scanner",
      customerEmail: "buyer@example.com",
      stripeSessionId: "cs_test_123",
    });
    deliveryMocks.deliverScannerIntakeSubmission.mockResolvedValue({
      ok: true,
    });
    paymentsMocks.spendScannerIntakeCredit.mockResolvedValue({
      status: "ok",
      creditsSpent: 500,
      creditsRemaining: 0,
      requestId: "scanner-intake:test",
    });

    const formData = buildFormData({
      ...validValues,
      prefillWebsite: "https://futco.ai",
      prefillAnalyzedAt: "2026-08-31T18:00:00.000Z",
      prefillModel: "",
      prefillSources: "[]",
      draftedFields: "[]",
      editedFields: "[]",
      prefillTruncated: "",
      prefillError: "network_error",
    });
    const result = await submitScannerIntakeForm(
      {
        status: "idle",
        values: emptyScannerIntakeFormValues,
        errors: {},
      },
      formData,
    );

    expect(result.status).toBe("success");
    expect(deliveryMocks.deliverScannerIntakeSubmission).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        enrichment: {
          ...emptyScannerIntakeEnrichment,
          website: "https://futco.ai",
          analyzedAt: "2026-08-31T18:00:00.000Z",
          error: "network_error",
        },
      }),
    );
  });

  it("carries successful prefill metadata through submission and produces a notify-compatible v2 body", async () => {
    headersMock.mockResolvedValue(
      new Headers({
        origin: "https://oppscan.e3d.ai",
        host: "oppscan.e3d.ai",
        "x-forwarded-for": "127.0.0.1",
      }),
    );
    securityMocks.isTrustedServerActionOrigin.mockReturnValue(true);
    securityMocks.isRateLimited.mockReturnValue(false);
    securityMocks.verifyTurnstileToken.mockResolvedValue(true);
    paymentsMocks.getScannerBalance.mockResolvedValue({
      product: "scanner",
      credits: 500,
    });
    paymentsMocks.getScannerCheckoutContext.mockResolvedValue({
      product: "scanner",
      customerEmail: "buyer@example.com",
      stripeSessionId: "cs_test_123",
    });
    deliveryMocks.deliverScannerIntakeSubmission.mockResolvedValue({
      ok: true,
    });
    paymentsMocks.spendScannerIntakeCredit.mockResolvedValue({
      status: "ok",
      creditsSpent: 500,
      creditsRemaining: 0,
      requestId: "scanner-intake:test",
    });

    const enrichment: ScannerIntakeEnrichmentInput = {
      website: "https://futco.ai",
      analyzedAt: "2026-08-31T18:00:00.000Z",
      model: "gpt-5-mini",
      sources: [{ url: "https://futco.ai", chars: 321 }],
      draftedFields: ["companyName", "industry"],
      editedFields: ["companyName"],
      truncated: false,
      error: null,
    };
    const formData = buildFormData({
      ...validValues,
      companyName: "FutCo Edited",
      prefillWebsite: "https://futco.ai",
      prefillAnalyzedAt: "2026-08-31T18:00:00.000Z",
      prefillModel: "gpt-5-mini",
      prefillSources: JSON.stringify(enrichment.sources),
      draftedFields: JSON.stringify(enrichment.draftedFields),
      editedFields: JSON.stringify(enrichment.editedFields),
      prefillTruncated: "false",
      prefillError: "",
    });

    const result = await submitScannerIntakeForm(
      {
        status: "idle",
        values: emptyScannerIntakeFormValues,
        errors: {},
      },
      formData,
    );

    expect(result.status).toBe("success");
    expect(deliveryMocks.deliverScannerIntakeSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: "FutCo Edited" }),
      expect.objectContaining({ enrichment }),
    );

    const actualDelivery = await vi.importActual<
      typeof import("@/lib/scanner-intake-delivery")
    >("@/lib/scanner-intake-delivery");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await actualDelivery.deliverScannerIntakeSubmission(
      { ...validValues, companyName: "FutCo Edited" },
      {
        requestId: "scanner-intake:prefilled",
        checkoutEmail: "buyer@example.com",
        enrichment,
      },
      {
        provider: "webhook",
        endpointUrl: "https://forms.example.com/scanner-intake",
        authToken: "server-secret",
        nodeEnv: "production",
      },
    );

    const deliveredBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const normalized = normalizeIntakeBody(deliveredBody);
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.record.schemaVersion).toBe(2);
      expect(normalized.record.enrichment).toEqual(enrichment);
    }
  });
});

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function idleState(): ScannerIntakeFormState {
  return {
    status: "idle",
    values: emptyScannerIntakeFormValues,
    errors: {},
  };
}

function configureSuccessfulPurchase() {
  headersMock.mockResolvedValue(
    new Headers({
      origin: "https://oppscan.e3d.ai",
      host: "oppscan.e3d.ai",
      "x-forwarded-for": "127.0.0.1",
    }),
  );
  securityMocks.isTrustedServerActionOrigin.mockReturnValue(true);
  securityMocks.isRateLimited.mockReturnValue(false);
  securityMocks.verifyTurnstileToken.mockResolvedValue(true);
  paymentsMocks.getScannerCheckoutContext.mockResolvedValue({
    product: "scanner",
    customerEmail: validValues.deliveryEmail,
    stripeSessionId: "cs_test_123",
  });
  paymentsMocks.getScannerBalance.mockResolvedValue({
    product: "scanner",
    credits: 500,
  });
  deliveryMocks.deliverScannerIntakeSubmission.mockResolvedValue({ ok: true });
  paymentsMocks.spendScannerIntakeCredit.mockResolvedValue({
    status: "ok",
    creditsSpent: 500,
    creditsRemaining: 0,
    requestId: "scanner-intake:test",
  });
}

function buildAnalysisResult() {
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    id: `candidate-${index + 1}`,
    title: `Candidate ${index + 1}`,
    summary: "A practical opportunity.",
    outcomeType: "automation" as const,
    impact: 5,
    feasibility: 4,
    timeToValue: 3,
    confidence: 4,
    risk: 2,
    evidence: ["Validated intake evidence."],
    firstStep: "Confirm the workflow owner.",
    score: 350,
    rank: index + 1,
    pointValue: 10,
  }));
  return {
    candidates,
    report: {
      executiveSummary: "A focused starting point is available.",
      recommendedStartingPoint: "Begin with the first ranked candidate.",
      opportunities: candidates.map((candidate) => ({
        candidateId: candidate.id,
        headline: candidate.title,
        whyItMatters: "It supports the stated goals.",
        practicalApproach: "Start with a bounded pilot.",
        considerations: ["Keep a human review step."],
      })),
      consultationPreparation: [
        "Who owns this workflow?",
        "What baseline should be measured?",
      ],
      closingNote: "Use the consultation to validate scope.",
    },
    baseScore: 50,
    potentialScore: 60,
  };
}
