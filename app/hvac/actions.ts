"use server";

import { createHash, randomUUID } from "node:crypto";
import { after } from "next/server";
import { headers } from "next/headers";

import { ScannerAnalysisError } from "@/lib/scanner-analysis";
import {
  HvacLiteProfileError,
  fetchHvacLiteCompanyProfile,
  generateLiteScannerAnalysis,
} from "@/lib/scanner-lite-analysis";
import { deliverScannerLiteSubmission } from "@/lib/scanner-lite-delivery";
import { buildHvacLeadContext } from "@/lib/hvac-fit";
import { detectHvacSiteSignals } from "@/lib/scanner-lite-site-signals";
import { detectHvacStack } from "@/lib/scanner-lite-stack";
import {
  hvacLiteErrorState,
  hvacLiteIntakeValuesFromFormData,
  hvacLiteSuccessState,
  validateHvacLiteIntakeValues,
  type HvacLiteFormState,
  type HvacLiteIntakeValues,
} from "@/lib/scanner-lite-intake";
import {
  classifyUserAgent,
  hashClientIp,
  logHvacLiteAttempt,
  summarizeWebsiteHost,
  trimUserAgent,
  type HvacLiteAttemptOutcome,
} from "@/lib/scanner-lite-attempt-log";
import { runHvacLiteBackground } from "@/lib/scanner-lite-background";
import { isHvacLiteRateLimited } from "@/lib/scanner-lite-rate-limit";
import {
  isTrustedServerActionOrigin,
  verifyTurnstileToken,
} from "@/lib/contact-security";
import { getCanonicalUrl } from "@/lib/seo";
import {
  buildReportUrl,
  createLeaseOwnerId,
  deriveLiteScanId,
  deriveReportAccessToken,
  getScannerReportStore,
  hashReportAccessToken,
  type ScannerCompletedReport,
  type ScannerReportStore,
} from "@/lib/scanner-report-store";
import {
  claimAndEmitScannerTelemetry,
  getScannerTelemetrySink,
} from "@/lib/scanner-telemetry";

const HVAC_LITE_CAMPAIGN_SOURCE = "hvac_lite";

export async function submitHvacLiteIntake(
  _previousState: HvacLiteFormState,
  formData: FormData,
): Promise<HvacLiteFormState> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  const forwardedFor = requestHeaders.get("x-forwarded-for") || "";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";

  const values = hvacLiteIntakeValuesFromFormData(formData);
  const validation = validateHvacLiteIntakeValues(values);

  // Everything the log line needs is captured now: the request headers are
  // not available once the work moves into the background.
  const attemptId = randomUUID().slice(0, 8);
  const rawUserAgent = requestHeaders.get("user-agent");
  const logContext = {
    attemptId,
    websiteHost: summarizeWebsiteHost(validation.values.companyWebsite),
    emailProvided: Boolean(validation.values.workEmail),
    turnstileTokenProvided: Boolean(validation.values.turnstileToken),
    toolsSelected: validation.values.toolsUsed.length,
    ipHash: hashClientIp(clientIp),
    userAgent: trimUserAgent(rawUserAgent),
    uaFlags: classifyUserAgent(rawUserAgent),
  };
  const logAttempt = (outcome: HvacLiteAttemptOutcome, reason?: string) =>
    logHvacLiteAttempt({
      ...logContext,
      outcome,
      ...(reason ? { reason } : {}),
    });

  if (!isTrustedServerActionOrigin(origin, host)) {
    logAttempt("rejected_origin");
    return hvacLiteErrorState(validation.values, {
      form: "The form session could not be verified. Please reload the page and try again.",
    });
  }

  // Honeypot: fake success, no LLM call, no delivery.
  if (validation.values.website) {
    logAttempt("rejected_honeypot");
    return hvacLiteSuccessState(validation.values);
  }

  if (isHvacLiteRateLimited(clientIp)) {
    logAttempt("rejected_rate_limit");
    return hvacLiteErrorState(validation.values, {
      form: "Too many requests. Please try again in a few minutes.",
    });
  }

  if (!validation.isValid) {
    logAttempt("rejected_validation", Object.keys(validation.errors).join(","));
    return hvacLiteErrorState(validation.values, validation.errors);
  }

  const turnstileOk = await verifyTurnstileToken(
    validation.values.turnstileToken,
    clientIp,
  );
  if (!turnstileOk) {
    logAttempt("rejected_turnstile");
    return hvacLiteErrorState(validation.values, {
      form: "Bot protection could not be verified. Please try again.",
    });
  }

  // The visitor has passed every check a human could fix, so answer now and do
  // the slow part (site analysis, two LLM calls, delivery -- about a minute)
  // after the response. The report is emailed when it is ready.
  logAttempt("accepted");
  const acceptedValues = validation.values;
  after(() =>
    runHvacLiteBackground(
      () => orchestrateHvacLiteIntake(acceptedValues, clientIp),
      (outcome, reason) => logAttempt(outcome, reason),
    ),
  );
  return hvacLiteSuccessState(acceptedValues);
}

type OrchestrationOptions = {
  store?: ScannerReportStore;
  now?: () => Date;
  leaseDurationMs?: number;
  leaseWaitMs?: number;
  pollIntervalMs?: number;
};

export async function orchestrateHvacLiteIntake(
  values: HvacLiteIntakeValues,
  clientIp: string,
  options: OrchestrationOptions = {},
): Promise<HvacLiteFormState> {
  let store: ScannerReportStore;
  try {
    store = options.store ?? getScannerReportStore();
  } catch {
    return retryableError(values);
  }

  const scanId = deriveLiteScanId(values.workEmail, values.companyWebsite);
  const now = options.now ?? (() => new Date());

  let completed: ScannerCompletedReport | null;
  try {
    completed = await store.getByScanId(scanId);
  } catch {
    return retryableError(values);
  }

  if (!completed) {
    const generated = await generateAndComplete(
      store,
      scanId,
      values,
      clientIp,
      now,
      options,
    );
    if (generated === "error") return retryableError(values);
    if (generated === "profile_error") {
      return hvacLiteErrorState(values, {
        companyWebsite:
          "We couldn't analyze that website. Double-check the URL and try again.",
      });
    }
    completed = generated;
  }

  // completed is now guaranteed set -- always (re)attempt delivery, even for
  // an already-generated report, since a prior attempt may have generated
  // the report but failed to deliver it (delivery success isn't tracked in
  // the store, so a resubmit is the only retry path for that failure mode).
  const deliveryResult = await deliverScannerLiteSubmission({
    requestId: `hvac-lite:${scanId}`,
    companyWebsite: values.companyWebsite,
    companyName: completed.companyName,
    workEmail: values.workEmail,
    marketingOptIn: values.marketingOptIn,
    reportUrl: getCanonicalUrl(buildReportUrl(completed.scanId)),
    campaign: HVAC_LITE_CAMPAIGN_SOURCE,
    leadContext: completed.campaign?.leadContext,
  });
  if (!deliveryResult.ok) {
    return hvacLiteErrorState(values, { form: deliveryResult.message });
  }

  return hvacLiteSuccessState(values);
}

async function generateAndComplete(
  store: ScannerReportStore,
  scanId: string,
  values: HvacLiteIntakeValues,
  clientIp: string,
  now: () => Date,
  options: OrchestrationOptions,
): Promise<ScannerCompletedReport | "error" | "profile_error"> {
  const ownerId = createLeaseOwnerId();
  const leaseDurationMs = options.leaseDurationMs ?? 180_000;
  let leaseResult: "acquired" | "busy" | "complete";
  try {
    const acquiredAt = now().getTime();
    leaseResult = await store.acquireGenerationLease(
      scanId,
      ownerId,
      acquiredAt,
      acquiredAt + leaseDurationMs,
    );
  } catch {
    return "error";
  }

  if (leaseResult === "complete") {
    const existing = await tryGetByScanId(store, scanId);
    return existing ?? "error";
  }

  if (leaseResult === "busy") {
    try {
      const completed = await waitForCompletedReport(
        store,
        scanId,
        options.leaseWaitMs ?? 180_000,
        options.pollIntervalMs ?? 500,
      );
      return completed ?? "error";
    } catch {
      return "error";
    }
  }

  let analysisStarted = false;
  try {
    const ipHash = createHash("sha256").update(clientIp).digest("hex");
    // Independent of each other and both hit the same website, so run them
    // concurrently. Signal detection never throws (see
    // scanner-lite-site-signals.ts) -- a fetch failure there just yields
    // all-false signals, it never blocks or fails the submission.
    const [profile, signals, detectedStack] = await Promise.all([
      fetchHvacLiteCompanyProfile(values.companyWebsite, { ipHash }),
      detectHvacSiteSignals(values.companyWebsite),
      detectHvacStack(values.companyWebsite),
    ]);
    const leadContext = buildHvacLeadContext(
      profile,
      values.toolsUsed,
      detectedStack,
    );

    await claimAndEmitScannerTelemetry(
      store,
      {
        scanId,
        eventName: "scanner_analysis_started",
        timestamp: now().toISOString(),
      },
      getScannerTelemetrySink(),
    );
    analysisStarted = true;

    const analysis = await generateLiteScannerAnalysis(scanId, profile, {
      signals,
      leadContext,
    });
    const token = deriveReportAccessToken(scanId);
    const completed = await store.completeReport(
      scanId,
      ownerId,
      {
        ...analysis,
        checkoutEmail: values.workEmail,
        companyName: profile.companyName,
        campaign: { source: HVAC_LITE_CAMPAIGN_SOURCE, leadContext },
      },
      hashReportAccessToken(token),
      now().toISOString(),
    );

    try {
      await claimAndEmitScannerTelemetry(
        store,
        {
          scanId,
          eventName: "scanner_analysis_completed",
          timestamp: now().toISOString(),
          candidateCount: completed.candidates.length,
        },
        getScannerTelemetrySink(),
      );
    } catch {
      // A persisted report remains available when completion telemetry fails.
    }

    return completed;
  } catch (error) {
    await safeRelease(store, scanId, ownerId);
    if (analysisStarted) {
      const category =
        error instanceof ScannerAnalysisError ? error.category : "internal";
      try {
        await claimAndEmitScannerTelemetry(
          store,
          {
            scanId,
            eventName: "scanner_analysis_failed",
            timestamp: now().toISOString(),
            failureCategory: category,
          },
          getScannerTelemetrySink(),
        );
      } catch {
        // Failure telemetry must not replace the controlled response.
      }
    }
    if (error instanceof HvacLiteProfileError) return "profile_error";
    return "error";
  }
}

async function tryGetByScanId(store: ScannerReportStore, scanId: string) {
  try {
    return await store.getByScanId(scanId);
  } catch {
    return null;
  }
}

async function waitForCompletedReport(
  store: ScannerReportStore,
  scanId: string,
  waitMs: number,
  pollMs: number,
) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const completed = await store.getByScanId(scanId);
    if (completed) return completed;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(pollMs, deadline - Date.now())),
    );
  }
  return store.getByScanId(scanId);
}

async function safeRelease(
  store: ScannerReportStore,
  scanId: string,
  ownerId: string,
) {
  try {
    await store.releaseGenerationLease(scanId, ownerId);
  } catch {}
}

function retryableError(values: HvacLiteIntakeValues) {
  return hvacLiteErrorState(values, {
    form: "Your free report could not be prepared right now. Please try again.",
  });
}
