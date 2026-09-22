"use server";

import { computeBaseScore } from "@/lib/scanner-scoring";
import {
  resolveReadinessScoreBand,
  validateReadinessScoreFormData,
  type ReadinessScoreFormState,
} from "@/lib/readiness-score";

export async function submitReadinessScore(
  _previousState: ReadinessScoreFormState,
  formData: FormData,
): Promise<ReadinessScoreFormState> {
  const validation = validateReadinessScoreFormData(formData);

  if (!validation.isValid) {
    return {
      status: "error",
      values: validation.values,
      errors: {
        ...validation.errors,
        form: "Review the highlighted fields and select one valid answer for each area.",
      },
    };
  }

  const score = computeBaseScore(validation.maturity);
  const band = resolveReadinessScoreBand(score);

  if (!band) {
    return {
      status: "error",
      values: validation.values,
      errors: {
        form: "The readiness score could not be calculated. Please try again.",
      },
    };
  }

  return {
    status: "success",
    values: validation.values,
    errors: {},
    result: {
      score,
      band,
    },
  };
}
