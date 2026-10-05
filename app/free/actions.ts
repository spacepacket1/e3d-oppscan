"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

import { resolvePrimaryCtaHref } from "@/content/site-config";
import { generateFreeScannerCandidates } from "@/lib/scanner-analysis";
import {
  freeScannerErrorState,
  freeScannerSuccessState,
  freeScannerIntakeValuesFromFormData,
  validateFreeScannerIntakeValues,
  type FreeScannerFormState,
} from "@/lib/scanner-free-intake";
import {
  buildFreeLeadId,
  freeLeadErrorState,
  freeLeadSuccessState,
  freeLeadValuesFromFormData,
  validateFreeLeadValues,
  type FreeLeadFormState,
} from "@/lib/scanner-free-lead";
import {
  buildFreeAttemptContext,
  logFreeAttempt,
  type FreeAttemptOutcome,
  type FreeAttemptStage,
} from "@/lib/scanner-free-attempt-log";
import { deliverFreeLead } from "@/lib/scanner-free-lead-delivery";
import { isFreeLeadRateLimited } from "@/lib/scanner-free-lead-rate-limit";
import {
  signFreeSummary,
  verifyFreeSummary,
} from "@/lib/scanner-free-summary-token";
import {
  isTrustedServerActionOrigin,
  verifyTurnstileToken,
} from "@/lib/contact-security";
import { getScannerReportStore } from "@/lib/scanner-report-store";
import { isFreeAnalysisRateLimited } from "@/lib/scanner-free-rate-limit";
import { summarizeWebsiteHost } from "@/lib/scanner-lite-attempt-log";
import { getCanonicalUrl } from "@/lib/seo";

export async function submitFreeScannerIntake(
  _previousState: FreeScannerFormState,
  formData: FormData,
): Promise<FreeScannerFormState> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  const forwardedFor = requestHeaders.get("x-forwarded-for") || "";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";

  const values = freeScannerIntakeValuesFromFormData(formData);
  const validation = validateFreeScannerIntakeValues(values);

  const attemptId = randomUUID().slice(0, 8);
  const context = buildFreeAttemptContext({
    clientIp,
    rawUserAgent: requestHeaders.get("user-agent"),
    website: validation.values.companyWebsite,
  });
  const logAttempt = (outcome: FreeAttemptOutcome, reason?: string) =>
    logFreeAttempt({
      attemptId,
      stage: "summary" satisfies FreeAttemptStage,
      outcome,
      ...(reason ? { reason } : {}),
      ...context,
      turnstileTokenProvided: Boolean(validation.values.turnstileToken),
    });

  if (!isTrustedServerActionOrigin(origin, host)) {
    logAttempt("rejected_origin");
    return freeScannerErrorState(validation.values, {
      form: "The form session could not be verified. Please reload the page and try again.",
    });
  }

  // Honeypot: fake success, no LLM call, no cost.
  if (validation.values.website) {
    logAttempt("rejected_honeypot");
    return freeScannerSuccessState(validation.values);
  }

  if (isFreeAnalysisRateLimited(clientIp)) {
    logAttempt("rejected_rate_limit");
    return freeScannerErrorState(validation.values, {
      form: "Too many free summaries requested. Please try again in a minute.",
    });
  }

  if (!validation.isValid) {
    logAttempt("rejected_validation", Object.keys(validation.errors).join(","));
    return freeScannerErrorState(validation.values, validation.errors);
  }

  const turnstileOk = await verifyTurnstileToken(
    validation.values.turnstileToken,
    clientIp,
  );
  if (!turnstileOk) {
    logAttempt("rejected_turnstile");
    return freeScannerErrorState(validation.values, {
      form: "Bot protection could not be verified. Please try again.",
    });
  }

  try {
    const ranked = await generateFreeScannerCandidates(validation.values);
    const state = freeScannerSuccessState(validation.values, ranked);
    const summaryToken = signFreeSummary(
      {
        websiteHost: summarizeWebsiteHost(validation.values.companyWebsite),
        totalFound: state.totalFound ?? 0,
        opportunities: (state.candidates ?? []).map((candidate) => ({
          title: candidate.title,
          summary: candidate.summary,
        })),
      },
      process.env.SCANNER_REPORT_TOKEN_SECRET,
    );
    logAttempt("succeeded");
    return { ...state, ...(summaryToken ? { summaryToken } : {}) };
  } catch {
    logAttempt("failed", "generation");
    return freeScannerErrorState(validation.values, {
      form: "Your free summary could not be generated right now. Please try again.",
    });
  }
}

// The optional second step: the visitor has seen their summary and asks for it
// by email. Saves the lead durably first, then emails it; see
// scanner-free-lead-delivery.ts for the delivery providers.
export async function submitFreeLeadCapture(
  _previousState: FreeLeadFormState,
  formData: FormData,
): Promise<FreeLeadFormState> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  const forwardedFor = requestHeaders.get("x-forwarded-for") || "";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";

  const values = freeLeadValuesFromFormData(formData);
  const validation = validateFreeLeadValues(values);
  const secret = process.env.SCANNER_REPORT_TOKEN_SECRET;
  const summary = verifyFreeSummary(validation.values.summaryToken, secret);

  const attemptId = randomUUID().slice(0, 8);
  const context = buildFreeAttemptContext({
    clientIp,
    rawUserAgent: requestHeaders.get("user-agent"),
    website: summary?.websiteHost ?? "",
  });
  const logAttempt = (outcome: FreeAttemptOutcome, reason?: string) =>
    logFreeAttempt({
      attemptId,
      stage: "lead_capture" satisfies FreeAttemptStage,
      outcome,
      ...(reason ? { reason } : {}),
      ...context,
      turnstileTokenProvided: Boolean(validation.values.turnstileToken),
      emailProvided: Boolean(validation.values.email),
      marketingOptIn: validation.values.marketingOptIn,
    });

  if (!isTrustedServerActionOrigin(origin, host)) {
    logAttempt("rejected_origin");
    return freeLeadErrorState(validation.values, {
      form: "The form session could not be verified. Please reload the page and try again.",
    });
  }

  // Honeypot: fake success, nothing saved or sent.
  if (validation.values.website) {
    logAttempt("rejected_honeypot");
    return freeLeadSuccessState(validation.values);
  }

  if (isFreeLeadRateLimited(clientIp)) {
    logAttempt("rejected_rate_limit");
    return freeLeadErrorState(validation.values, {
      form: "Too many requests. Please try again in a few minutes.",
    });
  }

  if (!validation.isValid) {
    logAttempt("rejected_validation", Object.keys(validation.errors).join(","));
    return freeLeadErrorState(validation.values, validation.errors);
  }

  const turnstileOk = await verifyTurnstileToken(
    validation.values.turnstileToken,
    clientIp,
  );
  if (!turnstileOk) {
    logAttempt("rejected_turnstile");
    return freeLeadErrorState(validation.values, {
      form: "Bot protection could not be verified. Please try again.",
    });
  }

  if (!summary) {
    logAttempt("rejected_summary_token");
    return freeLeadErrorState(validation.values, {
      form: "Your summary has expired. Please run the free summary again.",
    });
  }

  const leadId = buildFreeLeadId(validation.values.email, summary.websiteHost);
  let store;
  try {
    store = getScannerReportStore();
    const { created } = await store.saveFreeLead({
      leadId,
      createdAt: new Date().toISOString(),
      email: validation.values.email,
      marketingOptIn: validation.values.marketingOptIn,
      websiteHost: summary.websiteHost,
      opportunityTitles: summary.opportunities.map((opportunity) => opportunity.title),
      deliveryStatus: "pending",
    });
    if (!created) {
      // Same person, same site, asking again: already saved and emailed once.
      logAttempt("succeeded", "already_captured");
      return freeLeadSuccessState(validation.values);
    }
  } catch {
    logAttempt("failed", "save");
    return freeLeadErrorState(validation.values, {
      form: "We couldn't save your request right now. Please try again.",
    });
  }

  const delivery = await deliverFreeLead({
    leadId,
    email: validation.values.email,
    marketingOptIn: validation.values.marketingOptIn,
    websiteHost: summary.websiteHost,
    opportunities: summary.opportunities,
    bookingUrl: resolvePrimaryCtaHref(),
    deletionUrl: getCanonicalUrl("/data-deletion"),
  });

  try {
    await store.setFreeLeadDeliveryStatus(leadId, delivery.ok ? "sent" : "failed");
  } catch {
    // The lead itself is saved; a status update failing must not change the outcome.
  }

  // The lead is saved either way, so the visitor sees success; a delivery
  // failure is logged and visible in the ops feed as deliveryStatus "failed".
  logAttempt(delivery.ok ? "succeeded" : "failed", delivery.ok ? undefined : "delivery");
  return freeLeadSuccessState(validation.values);
}
