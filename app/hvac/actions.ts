"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { ScannerAnalysisError } from "@/lib/scanner-analysis";
import {
  HvacLiteProfileError,
  fetchHvacLiteCompanyProfile,
  generateLiteScannerAnalysis,
} from "@/lib/scanner-lite-analysis";
import { deliverScannerLiteSubmission } from "@/lib/scanner-lite-delivery";
import { detectHvacSiteSignals } from "@/lib/scanner-lite-site-signals";
import {
  hvacLiteErrorState,
  hvacLiteIntakeValuesFromFormData,
  hvacLiteSuccessState,
  validateHvacLiteIntakeValues,
  type HvacLiteFormState,
  type HvacLiteIntakeValues,
} from "@/lib/scanner-lite-intake";
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

  if (!isTrustedServerActionOrigin(origin, host)) {
    return hvacLiteErrorState(validation.values, {
      form: "The form session could not be verified. Please reload the page and try again.",
    });
  }

  // Honeypot: fake success, no LLM call, no delivery.
  if (validation.values.website) {
    return hvacLiteSuccessState(validation.values);
  }

  if (isHvacLiteRateLimited(clientIp)) {
    return hvacLiteErrorState(validation.values, {
      form: "Too many requests. Please try again in a few minutes.",
    });
  }

  if (!validation.isValid) {
    return hvacLiteErrorState(validation.values, validation.errors);
  }

  const turnstileOk = await verifyTurnstileToken(
    validation.values.turnstileToken,
    clientIp,
  );
  if (!turnstileOk) {
    return hvacLiteErrorState(validation.values, {
      form: "Bot protection could not be verified. Please try again.",
    });
  }

  try {
    return await orchestrateHvacLiteIntake(validation.values, clientIp);
  } catch {
    return hvacLiteErrorState(validation.values, {
      form: "Your free report could not be prepared right now. Please try again.",
    });
  }
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
    const [profile, signals] = await Promise.all([
      fetchHvacLiteCompanyProfile(values.companyWebsite, { ipHash }),
      detectHvacSiteSignals(values.companyWebsite),
    ]);

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

    const analysis = await generateLiteScannerAnalysis(scanId, profile, { signals });
    const token = deriveReportAccessToken(scanId);
    const completed = await store.completeReport(
      scanId,
      ownerId,
      {
        ...analysis,
        checkoutEmail: values.workEmail,
        companyName: profile.companyName,
        campaign: { source: HVAC_LITE_CAMPAIGN_SOURCE },
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
