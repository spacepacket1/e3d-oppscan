"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { deliverScannerIntakeSubmission } from "@/lib/scanner-intake-delivery";
import {
  emptyScannerIntakeEnrichment,
  isScannerIntakeFieldKey,
  type ScannerIntakeEnrichmentInput,
  type ScannerIntakePrefillSource,
} from "@/lib/scanner-intake-prefill";
import {
  scannerIntakeErrorState,
  scannerIntakeSuccessState,
  scannerIntakeValuesFromFormData,
  type ScannerIntakeFormState,
  validateScannerIntakeFormValues,
} from "@/lib/scanner-intake";
import {
  getScannerBalance,
  getScannerCheckoutContext,
  spendScannerIntakeCredit,
} from "@/lib/scanner-payments";
import {
  ScannerAnalysisError,
  generateScannerAnalysis,
  type ScannerLlmTransport,
} from "@/lib/scanner-analysis";
import {
  buildReportUrl,
  createLeaseOwnerId,
  deriveReportAccessToken,
  deriveScanId,
  getScannerReportStore,
  hashReportAccessToken,
  type ScannerReportStore,
} from "@/lib/scanner-report-store";
import {
  claimAndEmitScannerTelemetry,
  getScannerTelemetrySink,
  type ScannerTelemetrySink,
} from "@/lib/scanner-telemetry";
import {
  isRateLimited,
  isTrustedServerActionOrigin,
  verifyTurnstileToken,
} from "@/lib/contact-security";

export async function submitScannerIntakeForm(
  _previousState: ScannerIntakeFormState,
  formData: FormData,
): Promise<ScannerIntakeFormState> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  const forwardedFor = requestHeaders.get("x-forwarded-for") || "";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";

  const values = scannerIntakeValuesFromFormData(formData);
  const validation = validateScannerIntakeFormValues(values);

  if (!isTrustedServerActionOrigin(origin, host)) {
    return scannerIntakeErrorState(validation.values, {
      form: "The form session could not be verified. Please reload the page and try again.",
    });
  }

  if (validation.values.website) {
    return scannerIntakeSuccessState(validation.values);
  }

  if (
    isRateLimited(
      `scanner:${clientIp}:${validation.values.deliveryEmail || "anonymous"}`,
    )
  ) {
    return scannerIntakeErrorState(validation.values, {
      form: "Too many submissions. Please wait before trying again.",
    });
  }

  if (!validation.isValid) {
    return scannerIntakeErrorState(validation.values, validation.errors);
  }

  const turnstileOk = await verifyTurnstileToken(
    validation.values.turnstileToken,
    clientIp,
  );
  if (!turnstileOk) {
    return scannerIntakeErrorState(validation.values, {
      form: "Bot protection could not be verified. Please try again.",
    });
  }

  try {
    return await orchestrateScannerIntake(validation.values, formData);
  } catch {
    return scannerIntakeErrorState(validation.values, {
      form: "The scanner report could not be prepared right now. Please try again.",
    });
  }
}

type ScannerOrchestrationOptions = {
  store?: ScannerReportStore;
  transport?: ScannerLlmTransport;
  telemetrySink?: ScannerTelemetrySink;
  now?: () => Date;
  leaseDurationMs?: number;
  leaseWaitMs?: number;
  pollIntervalMs?: number;
  llmTimeoutMs?: number;
};

export async function orchestrateScannerIntake(
  values: ReturnType<typeof validateScannerIntakeFormValues>["values"],
  formData: FormData,
  options: ScannerOrchestrationOptions = {},
): Promise<ScannerIntakeFormState> {
  let store: ScannerReportStore;
  try {
    store = options.store ?? getScannerReportStore();
  } catch {
    return retryableError(values);
  }
  const scanId = deriveScanId(values.creditKey);
  const now = options.now ?? (() => new Date());
  try {
    const existing = await store.getByScanId(scanId);
    if (existing)
      return scannerIntakeSuccessState(values, buildReportUrl(scanId));
  } catch {
    return retryableError(values);
  }

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
    if (leaseResult === "complete") {
      const complete = await store.getByScanId(scanId);
      return complete
        ? scannerIntakeSuccessState(values, buildReportUrl(scanId))
        : retryableError(values);
    }
  } catch {
    return retryableError(values);
  }

  if (leaseResult === "busy") {
    try {
      const completed = await waitForCompletedReport(
        store,
        scanId,
        options.leaseWaitMs ?? 180_000,
        options.pollIntervalMs ?? 500,
      );
      return completed
        ? scannerIntakeSuccessState(values, buildReportUrl(scanId))
        : retryableError(values);
    } catch {
      return retryableError(values);
    }
  }

  let analysisStarted = false;
  try {
    const settled = await store.hasSettledSpend(scanId);
    // Needed for completeReport's checkoutEmail below on every path,
    // including a retry of an already-settled spend (e.g. after a prior
    // attempt's generation timed out) -- not just the first-time branch.
    const checkoutContext = await getScannerCheckoutContext(values.creditKey);
    if (!settled) {
      if (checkoutContext.customerEmail !== values.deliveryEmail) {
        await safeRelease(store, scanId, ownerId);
        return scannerIntakeErrorState(values, {
          deliveryEmail:
            "The report email must match the email Stripe collected during checkout.",
        });
      }
      const balance = await getScannerBalance(values.creditKey);
      if (balance.credits <= 0) {
        await safeRelease(store, scanId, ownerId);
        return scannerIntakeErrorState(values, {
          form: "This payment key does not have an unspent scanner credit available.",
        });
      }
      const requestId = buildScannerIntakeRequestId(values.creditKey, values);
      const deliveryResult = await deliverScannerIntakeSubmission(values, {
        requestId,
        checkoutEmail: checkoutContext.customerEmail,
        enrichment: readEnrichmentFromFormData(formData),
      });
      if (!deliveryResult.ok) {
        await safeRelease(store, scanId, ownerId);
        return scannerIntakeErrorState(values, {
          form: deliveryResult.message,
        });
      }
      const spend = await spendScannerIntakeCredit({
        creditKey: values.creditKey,
        requestId,
        metadata: {
          kind: "scanner_intake_submission",
          companyName: values.companyName,
          companyWebsite: values.companyWebsite,
          deliveryEmail: values.deliveryEmail,
          checkoutEmail: checkoutContext.customerEmail,
        },
      });
      if (spend.creditsSpent <= 0) {
        await safeRelease(store, scanId, ownerId);
        return retryableError(values);
      }
      await store.markSpendSettled(scanId, now().toISOString());
    }

    const startedEvent = {
      scanId,
      eventName: "scanner_analysis_started" as const,
      timestamp: now().toISOString(),
    };
    await claimAndEmitScannerTelemetry(
      store,
      startedEvent,
      options.telemetrySink ?? getScannerTelemetrySink(),
    );
    analysisStarted = true;
    const analysis = await generateScannerAnalysis(scanId, values, {
      ...(options.transport ? { transport: options.transport } : {}),
      ...(options.llmTimeoutMs ? { timeoutMs: options.llmTimeoutMs } : {}),
    });
    const token = deriveReportAccessToken(scanId);
    const completedAt = now().toISOString();
    let completed;
    try {
      completed = await store.completeReport(
        scanId,
        ownerId,
        {
          ...analysis,
          checkoutEmail: checkoutContext.customerEmail,
          companyName: values.companyName,
        },
        hashReportAccessToken(token),
        completedAt,
      );
    } catch {
      throw new ScannerAnalysisError("store");
    }
    try {
      await claimAndEmitScannerTelemetry(
        store,
        {
          scanId,
          eventName: "scanner_analysis_completed",
          timestamp: now().toISOString(),
          candidateCount: completed.candidates.length,
        },
        options.telemetrySink ?? getScannerTelemetrySink(),
      );
    } catch {
      // A persisted report remains available when completion telemetry fails.
    }
    return scannerIntakeSuccessState(values, buildReportUrl(completed.scanId));
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
          options.telemetrySink ?? getScannerTelemetrySink(),
        );
      } catch {
        // Failure telemetry must not replace the controlled response.
      }
    }
    return retryableError(values);
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

function retryableError(
  values: ReturnType<typeof validateScannerIntakeFormValues>["values"],
) {
  return scannerIntakeErrorState(values, {
    form: "The scanner report could not be prepared right now. Please try again.",
  });
}

function buildScannerIntakeRequestId(
  creditKey: string,
  values: ReturnType<typeof validateScannerIntakeFormValues>["values"],
) {
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify({
      creditKey,
      companyName: values.companyName,
      companyWebsite: values.companyWebsite,
      deliveryEmail: values.deliveryEmail,
      goals: [values.goalPrimary, values.goalSecondary, values.goalTertiary],
    }),
  );
  return `scanner-intake:${hash.digest("hex").slice(0, 24)}`;
}

function readEnrichmentFromFormData(
  formData: FormData,
): ScannerIntakeEnrichmentInput {
  return {
    website: readString(formData, "prefillWebsite"),
    analyzedAt: readString(formData, "prefillAnalyzedAt"),
    model: readString(formData, "prefillModel"),
    sources: readSources(formData.get("prefillSources")),
    draftedFields: readFieldKeys(formData.get("draftedFields")),
    editedFields: readFieldKeys(formData.get("editedFields")),
    truncated: readBoolean(formData.get("prefillTruncated")),
    error: readString(formData, "prefillError"),
  };
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: FormDataEntryValue | null) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return emptyScannerIntakeEnrichment.truncated;
}

function readFieldKeys(
  value: FormDataEntryValue | null,
): ScannerIntakeEnrichmentInput["draftedFields"] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry): entry is ReturnType<typeof readFieldKeys>[number] =>
        typeof entry === "string" && isScannerIntakeFieldKey(entry),
    );
  } catch {
    return [];
  }
}

function readSources(
  value: FormDataEntryValue | null,
): ScannerIntakePrefillSource[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (entry) =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof entry.url === "string" &&
          Number.isFinite(entry.chars),
      )
      .map((entry) => ({
        url: entry.url,
        chars: Number(entry.chars),
      }));
  } catch {
    return [];
  }
}
