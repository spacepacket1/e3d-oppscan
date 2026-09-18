import type { RankedScannerCandidate } from "@/lib/scanner-scoring";

export type FreeScannerIntakeFieldKey =
  | "companyName"
  | "industry"
  | "companyDescription"
  | "goalPrimary"
  | "timeConsumingWorkflows"
  | "currentAiUse";

export const FREE_INTAKE_FIELDS: {
  key: FreeScannerIntakeFieldKey;
  label: string;
  input: "text" | "textarea";
  rows?: number;
  maxLength: number;
  help?: string;
}[] = [
  {
    key: "companyName",
    label: "Company name",
    input: "text",
    maxLength: 160,
  },
  {
    key: "industry",
    label: "Industry",
    input: "text",
    maxLength: 120,
  },
  {
    key: "companyDescription",
    label: "What does your company do?",
    input: "textarea",
    rows: 4,
    maxLength: 1200,
  },
  {
    key: "goalPrimary",
    label: "Top business goal right now",
    input: "text",
    maxLength: 220,
  },
  {
    key: "timeConsumingWorkflows",
    label: "Which workflows consume the most time right now?",
    input: "textarea",
    rows: 4,
    maxLength: 1200,
  },
  {
    key: "currentAiUse",
    label: "Current AI use, if any",
    input: "textarea",
    rows: 3,
    maxLength: 800,
  },
];

export type FreeScannerIntakeValues = {
  [Key in FreeScannerIntakeFieldKey]: string;
} & {
  website: string; // honeypot
  turnstileToken: string;
};

export type FreeScannerIntakeErrors = Partial<
  Record<FreeScannerIntakeFieldKey | "form", string>
>;

export const FREE_SUMMARY_CANDIDATE_COUNT = 3;

export type FreeScannerFormState = {
  status: "idle" | "error" | "success";
  values: FreeScannerIntakeValues;
  errors: FreeScannerIntakeErrors;
  candidates?: RankedScannerCandidate[];
  totalFound?: number;
};

export function freeScannerSuccessState(
  values: FreeScannerIntakeValues,
  ranked?: RankedScannerCandidate[],
): FreeScannerFormState {
  return {
    status: "success",
    values,
    errors: {},
    ...(ranked
      ? {
          candidates: ranked.slice(0, FREE_SUMMARY_CANDIDATE_COUNT),
          totalFound: ranked.length,
        }
      : {}),
  };
}

export function freeScannerErrorState(
  values: FreeScannerIntakeValues,
  errors: FreeScannerIntakeErrors,
): FreeScannerFormState {
  return {
    status: "error",
    values,
    errors,
  };
}

export const emptyFreeScannerIntakeValues: FreeScannerIntakeValues = {
  companyName: "",
  industry: "",
  companyDescription: "",
  goalPrimary: "",
  timeConsumingWorkflows: "",
  currentAiUse: "",
  website: "",
  turnstileToken: "",
};

const requiredFieldMessages: Record<FreeScannerIntakeFieldKey, string> = {
  companyName: "Company name is required.",
  industry: "Industry is required.",
  companyDescription: "Tell us what your company does.",
  goalPrimary: "Add your top business goal.",
  timeConsumingWorkflows: "Describe the workflows that consume the most time.",
  currentAiUse: "Describe your current AI use, or say \"none\".",
};

export function freeScannerIntakeValuesFromFormData(
  formData: FormData,
): FreeScannerIntakeValues {
  const values = { ...emptyFreeScannerIntakeValues };
  for (const field of FREE_INTAKE_FIELDS) {
    values[field.key] = valueFromFormData(formData, field.key);
  }
  values.website = valueFromFormData(formData, "website");
  values.turnstileToken =
    valueFromFormData(formData, "cf-turnstile-response") ||
    valueFromFormData(formData, "turnstileToken");
  return values;
}

export function validateFreeScannerIntakeValues(
  values: FreeScannerIntakeValues,
) {
  const sanitized: FreeScannerIntakeValues = {
    ...values,
    companyName: cleanText(values.companyName),
    industry: cleanText(values.industry),
    companyDescription: cleanText(values.companyDescription),
    goalPrimary: cleanText(values.goalPrimary),
    timeConsumingWorkflows: cleanText(values.timeConsumingWorkflows),
    currentAiUse: cleanText(values.currentAiUse),
  };

  const errors: FreeScannerIntakeErrors = {};

  for (const field of FREE_INTAKE_FIELDS) {
    if (!sanitized[field.key]) {
      errors[field.key] = requiredFieldMessages[field.key];
    } else if (sanitized[field.key].length > field.maxLength) {
      errors[field.key] = `Keep this response under ${field.maxLength} characters.`;
    }
  }

  return {
    values: sanitized,
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

function valueFromFormData(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
