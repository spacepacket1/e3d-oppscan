// The HVAC Lite intake: just a website and a work email, unlike the free
// tier's seven fields or the paid intake's twenty-plus. OppScan reviews the
// public site itself instead of asking the visitor to describe goals or
// workflows -- see scanner-lite-analysis.ts.
export type HvacLiteIntakeValues = {
  companyWebsite: string;
  workEmail: string;
  marketingOptIn: boolean;
  website: string; // honeypot
  turnstileToken: string;
};

export type HvacLiteIntakeErrors = Partial<
  Record<"companyWebsite" | "workEmail" | "form", string>
>;

export type HvacLiteFormState = {
  status: "idle" | "error" | "success";
  values: HvacLiteIntakeValues;
  errors: HvacLiteIntakeErrors;
};

export const emptyHvacLiteIntakeValues: HvacLiteIntakeValues = {
  companyWebsite: "",
  workEmail: "",
  marketingOptIn: false,
  website: "",
  turnstileToken: "",
};

export function hvacLiteSuccessState(
  values: HvacLiteIntakeValues,
): HvacLiteFormState {
  return { status: "success", values, errors: {} };
}

export function hvacLiteErrorState(
  values: HvacLiteIntakeValues,
  errors: HvacLiteIntakeErrors,
): HvacLiteFormState {
  return { status: "error", values, errors };
}

export function hvacLiteIntakeValuesFromFormData(
  formData: FormData,
): HvacLiteIntakeValues {
  return {
    companyWebsite: valueFromFormData(formData, "companyWebsite"),
    workEmail: valueFromFormData(formData, "workEmail"),
    marketingOptIn: formData.get("marketingOptIn") === "on",
    website: valueFromFormData(formData, "website"),
    turnstileToken:
      valueFromFormData(formData, "cf-turnstile-response") ||
      valueFromFormData(formData, "turnstileToken"),
  };
}

export function validateHvacLiteIntakeValues(values: HvacLiteIntakeValues) {
  const sanitized: HvacLiteIntakeValues = {
    ...values,
    companyWebsite: normalizeHttpUrlInput(values.companyWebsite),
    workEmail: cleanText(values.workEmail),
  };

  const errors: HvacLiteIntakeErrors = {};

  if (!sanitized.companyWebsite) {
    errors.companyWebsite = "Business website is required.";
  } else if (sanitized.companyWebsite.length > 200) {
    errors.companyWebsite = "Keep this under 200 characters.";
  } else if (!isValidHttpUrl(sanitized.companyWebsite)) {
    errors.companyWebsite = "Enter a valid website URL.";
  }

  if (!sanitized.workEmail) {
    errors.workEmail = "Work email is required.";
  } else if (sanitized.workEmail.length > 200) {
    errors.workEmail = "Keep this under 200 characters.";
  } else if (!isValidEmail(sanitized.workEmail)) {
    errors.workEmail = "Enter a valid email address.";
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

function normalizeHttpUrlInput(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) return "";
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (/^[^\s]+\.[^\s]+$/i.test(cleaned)) return `https://${cleaned}`;
  return cleaned;
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
