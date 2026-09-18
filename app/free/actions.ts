"use server";

import { headers } from "next/headers";

import { generateFreeScannerCandidates } from "@/lib/scanner-analysis";
import {
  freeScannerErrorState,
  freeScannerSuccessState,
  freeScannerIntakeValuesFromFormData,
  validateFreeScannerIntakeValues,
  type FreeScannerFormState,
} from "@/lib/scanner-free-intake";
import {
  isTrustedServerActionOrigin,
  verifyTurnstileToken,
} from "@/lib/contact-security";
import { isFreeAnalysisRateLimited } from "@/lib/scanner-free-rate-limit";

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

  if (!isTrustedServerActionOrigin(origin, host)) {
    return freeScannerErrorState(validation.values, {
      form: "The form session could not be verified. Please reload the page and try again.",
    });
  }

  // Honeypot: fake success, no LLM call, no cost.
  if (validation.values.website) {
    return freeScannerSuccessState(validation.values);
  }

  if (isFreeAnalysisRateLimited(clientIp)) {
    return freeScannerErrorState(validation.values, {
      form: "Too many free summaries requested. Please try again in a minute.",
    });
  }

  if (!validation.isValid) {
    return freeScannerErrorState(validation.values, validation.errors);
  }

  const turnstileOk = await verifyTurnstileToken(
    validation.values.turnstileToken,
    clientIp,
  );
  if (!turnstileOk) {
    return freeScannerErrorState(validation.values, {
      form: "Bot protection could not be verified. Please try again.",
    });
  }

  try {
    const ranked = await generateFreeScannerCandidates(validation.values);
    return freeScannerSuccessState(validation.values, ranked);
  } catch {
    return freeScannerErrorState(validation.values, {
      form: "Your free summary could not be generated right now. Please try again.",
    });
  }
}
