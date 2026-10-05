import { createHash } from "node:crypto";

// The optional second step of the free summary: once the visitor has seen
// their top opportunities, they can ask for the summary by email. The email
// is the only personal data collected here.
export type FreeLeadValues = {
  email: string;
  marketingOptIn: boolean;
  website: string; // honeypot
  turnstileToken: string;
  summaryToken: string;
};

export type FreeLeadErrors = Partial<Record<"email" | "form", string>>;

export type FreeLeadFormState = {
  status: "idle" | "error" | "success";
  values: FreeLeadValues;
  errors: FreeLeadErrors;
};

export const emptyFreeLeadValues: FreeLeadValues = {
  email: "",
  marketingOptIn: false,
  website: "",
  turnstileToken: "",
  summaryToken: "",
};

export function freeLeadSuccessState(values: FreeLeadValues): FreeLeadFormState {
  return { status: "success", values, errors: {} };
}

export function freeLeadErrorState(
  values: FreeLeadValues,
  errors: FreeLeadErrors,
): FreeLeadFormState {
  return { status: "error", values, errors };
}

export function freeLeadValuesFromFormData(formData: FormData): FreeLeadValues {
  return {
    email: valueFromFormData(formData, "email"),
    marketingOptIn: formData.get("marketingOptIn") === "on",
    website: valueFromFormData(formData, "website"),
    turnstileToken:
      valueFromFormData(formData, "cf-turnstile-response") ||
      valueFromFormData(formData, "turnstileToken"),
    summaryToken: valueFromFormData(formData, "summaryToken"),
  };
}

export function validateFreeLeadValues(values: FreeLeadValues) {
  const sanitized: FreeLeadValues = {
    ...values,
    email: values.email.replace(/\s+/g, " ").trim(),
  };
  const errors: FreeLeadErrors = {};

  if (!sanitized.email) {
    errors.email = "Enter your email address.";
  } else if (sanitized.email.length > 200) {
    errors.email = "Keep this under 200 characters.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized.email)) {
    errors.email = "Enter a valid email address.";
  }

  return { values: sanitized, errors, isValid: Object.keys(errors).length === 0 };
}

// Deterministic, so the same person asking twice for the same site's summary
// is one lead -- and is emailed once, not twice.
export function buildFreeLeadId(email: string, websiteHost: string) {
  const digest = createHash("sha256")
    .update(`${email.trim().toLowerCase()}|${websiteHost.toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
  return `free_lead_${digest}`;
}

function valueFromFormData(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
