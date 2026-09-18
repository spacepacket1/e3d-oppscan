import type { RankedScannerCandidate } from "@/lib/scanner-scoring";

export type FreeScannerIntakeFieldKey =
  | "companyWebsite"
  | "companyName"
  | "industry"
  | "companyDescription"
  | "goalPrimary"
  | "timeConsumingWorkflows"
  | "currentAiUse";

// Fields the free "Analyze my site" prefill can actually draft, mirroring
// the paid intake's prefillable-field split (goals, workflows, and current
// AI use aren't derivable from a public website).
export const FREE_PREFILLABLE_FIELDS: readonly FreeScannerIntakeFieldKey[] = [
  "companyName",
  "industry",
  "companyDescription",
];

export const FREE_INTAKE_FIELDS: {
  key: FreeScannerIntakeFieldKey;
  label: string;
  input: "text" | "textarea" | "url";
  rows?: number;
  maxLength: number;
  help?: string;
}[] = [
  {
    key: "companyWebsite",
    label: "Company website",
    input: "url",
    maxLength: 200,
    help: "Analyze it to draft the company name, industry, and description below.",
  },
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
  companyWebsite: "",
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
  companyWebsite: "Company website is required.",
  companyName: "Company name is required.",
  industry: "Industry is required.",
  companyDescription: "Tell us what your company does.",
  goalPrimary: "Add your top business goal.",
  timeConsumingWorkflows: "Describe the workflows that consume the most time.",
  currentAiUse: "Describe your current AI use, or say \"none\".",
};

// Free-tier prefill draft: only the three fields FREE_PREFILLABLE_FIELDS
// covers. Mirrors mergeScannerIntakeDraft in scanner-intake-prefill.ts —
// never overwrites something the person already typed.
export type FreeScannerIntakeDraft = Partial<
  Record<(typeof FREE_PREFILLABLE_FIELDS)[number], string | null>
>;

export function mergeFreeScannerIntakeDraft(
  values: FreeScannerIntakeValues,
  draft: FreeScannerIntakeDraft,
) {
  const nextValues = { ...values };
  const draftedFields: FreeScannerIntakeFieldKey[] = [];

  for (const key of FREE_PREFILLABLE_FIELDS) {
    const rawValue = draft[key];
    if (rawValue == null) continue;
    if (String(values[key] ?? "").trim() !== "") continue;
    nextValues[key] = cleanText(rawValue);
    draftedFields.push(key);
  }

  return { values: nextValues, draftedFields };
}

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
    companyWebsite: normalizeHttpUrlInput(values.companyWebsite),
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

  if (sanitized.companyWebsite && !isValidHttpUrl(sanitized.companyWebsite)) {
    errors.companyWebsite = "Enter a valid website URL.";
  }

  return {
    values: sanitized,
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

function normalizeHttpUrlInput(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return "";
  }
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }
  if (/^[^\s]+\.[^\s]+$/i.test(cleaned)) {
    return `https://${cleaned}`;
  }
  return cleaned;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function valueFromFormData(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
