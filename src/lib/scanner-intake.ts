import {
  INTAKE_FIELDS,
  type ScannerIntakeFieldKey,
} from "@/lib/scanner-intake-fields";

export type ScannerIntakeFormValues = {
  [Key in ScannerIntakeFieldKey]: string;
};

export type ScannerIntakeFormErrors = Partial<
  Record<keyof ScannerIntakeFormValues | "form", string>
>;

export type ScannerIntakeFormState = {
  status: "idle" | "error" | "success";
  values: ScannerIntakeFormValues;
  errors: ScannerIntakeFormErrors;
  message?: string;
  submissionId?: string;
  reportUrl?: string;
};

export const emptyScannerIntakeFormValues: ScannerIntakeFormValues =
  buildValues((field) => [field.key, ""]);

const maxLengths: Record<keyof ScannerIntakeFormValues, number> = buildValues(
  (field) => [field.key, field.maxLength],
);

const requiredFieldMessages: Partial<Record<ScannerIntakeFieldKey, string>> = {
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
  timeConsumingWorkflows: "Describe the workflows that consume the most time.",
  currentAiUse: "Describe how AI is used today.",
  aiToolsInUse: "List the AI tools or subscriptions already in use.",
  pastAiAttempts: "Describe any AI attempts that stalled or failed.",
  coreBusinessSystems: "Describe the core business systems in use.",
  dataLocations: "Describe where business data lives.",
  dataSensitivity: "Describe any data sensitivity or regulated constraints.",
  deliveryEmail: "Report email is required.",
};

const urlFieldMessages: Partial<Record<ScannerIntakeFieldKey, string>> = {
  companyWebsite: "Enter a valid website URL.",
  companyLinkedin: "Enter a valid URL.",
  founderLinkedin: "Enter a valid URL.",
  workflowSampleLink: "Enter a valid URL.",
};

export function scannerIntakeValuesFromFormData(
  formData: FormData,
): ScannerIntakeFormValues {
  const values = buildValues((field) => [
    field.key,
    valueFromFormData(formData, field.key),
  ]);

  values.turnstileToken =
    valueFromFormData(formData, "cf-turnstile-response") ||
    values.turnstileToken;

  return values;
}

export function validateScannerIntakeFormValues(
  values: ScannerIntakeFormValues,
) {
  const sanitized = sanitizeScannerIntakeFormValues(values);
  const errors: ScannerIntakeFormErrors = {};

  for (const field of INTAKE_FIELDS) {
    if (field.required) {
      requireText(
        field.key,
        getRequiredFieldMessage(field.key),
        sanitized,
        errors,
      );
    }
  }

  if (sanitized.deliveryEmail && !isValidEmail(sanitized.deliveryEmail)) {
    errors.deliveryEmail = "Enter a valid email address.";
  }

  if (sanitized.companyWebsite && !isValidHttpUrl(sanitized.companyWebsite)) {
    errors.companyWebsite = "Enter a valid website URL.";
  }

  for (const [field, message] of Object.entries(urlFieldMessages) as [
    keyof typeof urlFieldMessages,
    string,
  ][]) {
    if (
      field !== "companyWebsite" &&
      sanitized[field] &&
      !isValidHttpUrl(sanitized[field])
    ) {
      errors[field] = message;
    }
  }

  for (const [field, maxLength] of Object.entries(maxLengths) as [
    keyof ScannerIntakeFormValues,
    number,
  ][]) {
    if (sanitized[field].length > maxLength) {
      errors[field] = `Keep this response under ${maxLength} characters.`;
    }
  }

  return {
    values: sanitized,
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function scannerIntakeSuccessState(
  values = emptyScannerIntakeFormValues,
  reportUrl?: string,
): ScannerIntakeFormState {
  return {
    status: "success",
    values,
    errors: {},
    message:
      "Intake received. FutCo will use the email you confirmed here when the scanner report is ready.",
    submissionId: crypto.randomUUID(),
    ...(reportUrl ? { reportUrl } : {}),
  };
}

export function scannerIntakeErrorState(
  values: ScannerIntakeFormValues,
  errors: ScannerIntakeFormErrors,
): ScannerIntakeFormState {
  return {
    status: "error",
    values,
    errors,
    submissionId: crypto.randomUUID(),
  };
}

export function maskEmailAddress(value: string) {
  const normalized = cleanText(value).toLowerCase();
  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) {
    return "";
  }
  const localStart = localPart.slice(0, 1);
  const localEnd = localPart.slice(-1);
  return `${localStart}***${localEnd}@${domain}`;
}

export function formatScannerCheckoutEmailHint(value: string) {
  return maskEmailAddress(value) || "not available";
}

function valueFromFormData(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function sanitizeScannerIntakeFormValues(
  values: ScannerIntakeFormValues,
): ScannerIntakeFormValues {
  return buildValues((field) => [
    field.key,
    sanitizeFieldValue(field.key, values[field.key]),
  ]);
}

function sanitizeFieldValue(key: keyof ScannerIntakeFormValues, value: string) {
  if (
    key === "companyWebsite" ||
    key === "companyLinkedin" ||
    key === "founderLinkedin" ||
    key === "workflowSampleLink"
  ) {
    return normalizeHttpUrlInput(value);
  }

  if (key === "deliveryEmail") {
    return cleanText(value).toLowerCase();
  }

  return cleanText(value);
}

function getRequiredFieldMessage(field: keyof ScannerIntakeFormValues) {
  const message = requiredFieldMessages[field];
  if (!message) {
    throw new Error(`Unexpected required intake field: ${field}`);
  }

  return message;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
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

function requireText(
  field: keyof ScannerIntakeFormValues,
  message: string,
  values: ScannerIntakeFormValues,
  errors: ScannerIntakeFormErrors,
) {
  if (!values[field]) {
    errors[field] = message;
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildValues<Value>(
  buildEntry: (
    field: (typeof INTAKE_FIELDS)[number],
  ) => readonly [ScannerIntakeFieldKey, Value],
): { [Key in ScannerIntakeFieldKey]: Value } {
  return Object.fromEntries(INTAKE_FIELDS.map(buildEntry)) as {
    [Key in ScannerIntakeFieldKey]: Value;
  };
}
