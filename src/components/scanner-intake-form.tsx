"use client";

import { useActionState, useEffect, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import Link from "next/link";

import { scannerContent } from "@/content/scanner-content";
import {
  emptyScannerIntakeFormValues,
  type ScannerIntakeFormErrors,
  type ScannerIntakeFormState,
  type ScannerIntakeFormValues,
  validateScannerIntakeFormValues,
} from "@/lib/scanner-intake";
import {
  clearScannerIntakeDraft,
  computeEditedScannerIntakeFields,
  emptyScannerIntakeDraft,
  emptyScannerIntakeEnrichment,
  mergeScannerIntakeDraft,
  type ScannerIntakeDraft,
  type ScannerIntakeEnrichmentInput,
  type ScannerIntakePrefillSource,
} from "@/lib/scanner-intake-prefill";
import { INTAKE_FIELDS, type IntakeField } from "@/lib/scanner-intake-fields";
import { SCANNER_CREDIT_KEY_STORAGE_KEY } from "@/lib/scanner-intake-session";
import { resetTurnstileWidget } from "@/lib/turnstile-widget";

const TURNSTILE_WIDGET_ID = "scanner-intake-turnstile";

const groupLabels = {
  company: "Company",
  people: "People",
  ai: "AI",
  goals: "Goals",
  operations: "Operations",
  infrastructure: "Infrastructure",
  constraints: "Constraints",
  delivery: "Report delivery",
} as const;

type AccessState =
  | { status: "idle"; message?: string }
  | { status: "loading"; message: string }
  | {
      status: "ready";
      message: string;
      checkoutEmailHint: string;
      credits: number;
      creditKey: string;
    }
  | { status: "error"; message: string };

type ClaimResponse =
  | {
      status: "completed";
      creditKey: string;
      checkoutEmailHint: string;
      credits: number;
      message?: string;
    }
  | {
      status: "pending" | "already_claimed" | "not_found" | "failed";
      message: string;
    };

type StatusResponse =
  | {
      eligible: true;
      credits: number;
      checkoutEmailHint: string;
    }
  | {
      eligible: false;
      message: string;
    };

type PrefillResponse =
  | {
      ok: true;
      draft: ScannerIntakeDraft;
      sources: ScannerIntakePrefillSource[];
      model: string | null;
      truncated: boolean | null;
    }
  | {
      ok: false;
      reason: string;
    };

type PrefillStatus = "idle" | "analyzing" | "done" | "failed";

type RenderTierOptions = {
  setValues: Dispatch<SetStateAction<ScannerIntakeFormValues>>;
  prefillState: PrefillStatus;
  draftedFields: (keyof ScannerIntakeFormValues)[];
  onAnalyzeSite: () => Promise<void>;
  onClearDrafts: () => void;
};

type ScannerIntakeFormProps = {
  action: (
    previousState: ScannerIntakeFormState,
    formData: FormData,
  ) => Promise<ScannerIntakeFormState>;
  initialState: ScannerIntakeFormState;
  turnstileSiteKey?: string;
  stripeSessionId?: string;
  initialVerifiedAccess?: {
    creditKey: string;
    checkoutEmailHint: string;
    credits: number;
  };
};

export function ScannerIntakeForm({
  action,
  initialState,
  turnstileSiteKey = "",
  stripeSessionId = "",
  initialVerifiedAccess,
}: ScannerIntakeFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [clientErrors, setClientErrors] = useState<ScannerIntakeFormErrors>({});
  const [initialStoredKey] = useState(
    () =>
      (typeof window !== "undefined"
        ? window.localStorage.getItem(SCANNER_CREDIT_KEY_STORAGE_KEY)
        : ""
      )?.trim() || "",
  );
  const [paymentKeyInput, setPaymentKeyInput] = useState(
    initialVerifiedAccess?.creditKey ||
      initialState.values.creditKey ||
      initialStoredKey,
  );
  const [values, setValues] = useState(initialState.values);
  const [accessState, setAccessState] = useState<AccessState>(
    initialVerifiedAccess
      ? {
          status: "ready",
          message: scannerContent.intakePage.accessReady,
          checkoutEmailHint: initialVerifiedAccess.checkoutEmailHint,
          credits: initialVerifiedAccess.credits,
          creditKey: initialVerifiedAccess.creditKey,
        }
      : {
          status: "idle",
          message: scannerContent.intakePage.accessMissing,
        },
  );
  const [prefillState, setPrefillState] = useState<PrefillStatus>("idle");
  const [prefillData, setPrefillData] = useState<ScannerIntakeEnrichmentInput>(
    emptyScannerIntakeEnrichment,
  );
  const [draftValues, setDraftValues] = useState<ScannerIntakeDraft>(
    emptyScannerIntakeDraft,
  );
  const errors = { ...state.errors, ...clientErrors };

  useEffect(() => {
    if (state.status !== "success" || !state.reportUrl) {
      return;
    }
    window.localStorage.removeItem(SCANNER_CREDIT_KEY_STORAGE_KEY);
  }, [state.status, state.reportUrl]);

  // A stale or already-verified Turnstile token left in the widget after a
  // failed submission would fail the same way on a plain resubmit, so force
  // a fresh challenge/token any time the server rejects the form.
  useEffect(() => {
    if (state.status !== "error") return;
    resetTurnstileWidget(TURNSTILE_WIDGET_ID);
  }, [state]);

  async function claimStripeSession(sessionId: string) {
    setAccessState({
      status: "loading",
      message: scannerContent.intakePage.accessClaiming,
    });

    const response = await fetch("/api/scanner-intake/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });

    const payload = (await response.json()) as ClaimResponse;

    if (payload.status === "completed") {
      window.localStorage.setItem(
        SCANNER_CREDIT_KEY_STORAGE_KEY,
        payload.creditKey,
      );
      setPaymentKeyInput(payload.creditKey);
      setAccessState({
        status: "ready",
        message: payload.message || scannerContent.intakePage.accessReady,
        checkoutEmailHint: payload.checkoutEmailHint,
        credits: payload.credits,
        creditKey: payload.creditKey,
      });
      return;
    }

    if (payload.status === "pending") {
      window.setTimeout(() => {
        void claimStripeSession(sessionId);
      }, 1500);
      return;
    }

    setAccessState({
      status: "error",
      message: payload.message,
    });
  }

  async function verifyCreditKey(creditKey: string) {
    const normalizedKey = creditKey.trim();

    if (!normalizedKey) {
      setAccessState({
        status: "error",
        message: scannerContent.intakePage.accessMissing,
      });
      return;
    }

    setAccessState({
      status: "loading",
      message: "Checking scanner credit balance...",
    });

    const response = await fetch("/api/scanner-intake/status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ creditKey: normalizedKey }),
    });

    const payload = (await response.json()) as StatusResponse;

    if (!payload.eligible) {
      setAccessState({
        status: "error",
        message: payload.message,
      });
      return;
    }

    window.localStorage.setItem(SCANNER_CREDIT_KEY_STORAGE_KEY, normalizedKey);
    setAccessState({
      status: "ready",
      message: scannerContent.intakePage.accessReady,
      checkoutEmailHint: payload.checkoutEmailHint,
      credits: payload.credits,
      creditKey: normalizedKey,
    });
  }

  async function runPrefill() {
    const websiteValidation = validateScannerIntakeFormValues({
      ...emptyScannerIntakeFormValues,
      companyWebsite: values.companyWebsite.trim(),
    });

    if (websiteValidation.errors.companyWebsite) {
      setClientErrors((currentErrors) => ({
        ...currentErrors,
        companyWebsite: websiteValidation.errors.companyWebsite,
      }));
      return;
    }

    // Use the normalized URL (bare "example.com" -> "https://example.com").
    const website = websiteValidation.values.companyWebsite;

    setPrefillState("analyzing");
    setClientErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors.companyWebsite;
      return nextErrors;
    });

    try {
      const response = await fetch("/api/scanner-intake/prefill", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ website }),
      });
      const payload = (await response.json()) as PrefillResponse;

      if (!response.ok || !payload.ok) {
        setPrefillState("failed");
        setPrefillData((currentPrefillData) =>
          currentPrefillData.draftedFields.length > 0
            ? currentPrefillData
            : {
                ...emptyScannerIntakeEnrichment,
                website,
                analyzedAt: new Date().toISOString(),
                error: payload.ok ? "prefill_failed" : payload.reason,
              },
        );
        return;
      }

      const merged = mergeScannerIntakeDraft(values, payload.draft);
      setValues(merged.values);
      setDraftValues(payload.draft);
      setPrefillData({
        website,
        analyzedAt: new Date().toISOString(),
        model: payload.model,
        sources: payload.sources,
        draftedFields: merged.draftedFields,
        editedFields: [],
        truncated: payload.truncated,
        error: null,
      });
      setPrefillState("done");
    } catch {
      setPrefillState("failed");
      setPrefillData((currentPrefillData) =>
        currentPrefillData.draftedFields.length > 0
          ? currentPrefillData
          : {
              ...emptyScannerIntakeEnrichment,
              website,
              analyzedAt: new Date().toISOString(),
              error: "network_error",
            },
      );
    }
  }

  function clearDrafts() {
    setValues((currentValues) =>
      clearScannerIntakeDraft(
        currentValues,
        draftValues,
        prefillData.draftedFields,
      ),
    );
    setDraftValues(emptyScannerIntakeDraft());
    setPrefillData(emptyScannerIntakeEnrichment);
    setPrefillState("idle");
  }

  useEffect(() => {
    if (initialVerifiedAccess) {
      return;
    }
    if (initialStoredKey) {
      const timer = window.setTimeout(() => {
        void verifyCreditKey(initialStoredKey);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (!stripeSessionId) {
      return;
    }

    const timer = window.setTimeout(() => {
      void claimStripeSession(stripeSessionId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialStoredKey, initialVerifiedAccess, stripeSessionId]);

  if (state.status === "success") {
    const hasReport = Boolean(state.reportUrl);
    return (
      <div className="contact-confirmation" role="status">
        <h2>
          {hasReport
            ? scannerContent.intakePage.reportSuccessHeading
            : scannerContent.intakePage.successHeading}
        </h2>
        <p>
          {hasReport
            ? scannerContent.intakePage.reportSuccessBody
            : scannerContent.intakePage.successBody}
        </p>
        {state.reportUrl ? (
          <Link className="button button--primary" href={state.reportUrl}>
            View your scanner report
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="scanner-intake-layout">
      {accessState.status === "ready" ? (
        <p className="development-note" role="status" aria-live="polite">
          {accessState.message} Checkout email on file:{" "}
          {accessState.checkoutEmailHint}. Scanner access is ready
          {accessState.credits > 0
            ? ` with ${accessState.credits} credits remaining`
            : ""}
          .
        </p>
      ) : (
        <section
          className="contact-confirmation scanner-intake-access"
          aria-live="polite"
        >
          <div className="contact-form__header">
            <h2>{scannerContent.intakePage.accessHeading}</h2>
            <p>{scannerContent.intakePage.accessBody}</p>
          </div>

          <div className="scanner-intake-key-row">
            <Field id="paymentKey" label="Payment key">
              <input
                autoCapitalize="none"
                autoComplete="off"
                onChange={(event) =>
                  setPaymentKeyInput(event.currentTarget.value)
                }
                placeholder="e3d_scanner_pay_..."
                spellCheck={false}
                type="text"
                value={paymentKeyInput}
              />
            </Field>
            <button
              className="button button--primary"
              onClick={() => void verifyCreditKey(paymentKeyInput)}
              type="button"
            >
              Unlock intake
            </button>
          </div>

          <p
            className={
              accessState.status === "error"
                ? "form-error form-error--summary"
                : "development-note"
            }
            role={accessState.status === "error" ? "alert" : "status"}
          >
            {accessState.message}
          </p>
        </section>
      )}

      {accessState.status === "ready" ? (
        <form
          action={formAction}
          className="contact-form"
          noValidate
          onSubmit={(event) => {
            setClientErrors({});
            const formData = new FormData(event.currentTarget);
            const validationValues = buildValidationValues(
              formData,
              accessState.creditKey,
            );
            const editedFields = computeEditedScannerIntakeFields(
              validationValues,
              draftValues,
              prefillData.draftedFields,
            );
            syncHiddenInput(
              event.currentTarget,
              "editedFields",
              JSON.stringify(editedFields),
            );
            const validation =
              validateScannerIntakeFormValues(validationValues);

            if (!validation.isValid) {
              event.preventDefault();
              setClientErrors(validation.errors);
            }
          }}
        >
          <div className="contact-form__header">
            <h2>Business intake</h2>
            <p>{scannerContent.intake.description}</p>
            <p>{scannerContent.intakePage.keyHelp}</p>
          </div>

          {errors.form ? (
            <p className="form-error form-error--summary" role="alert">
              {errors.form}
            </p>
          ) : null}

          <input name="creditKey" type="hidden" value={accessState.creditKey} />
          <input
            name="prefillWebsite"
            type="hidden"
            value={prefillData.website || ""}
          />
          <input
            name="prefillAnalyzedAt"
            type="hidden"
            value={prefillData.analyzedAt || ""}
          />
          <input
            name="prefillModel"
            type="hidden"
            value={prefillData.model || ""}
          />
          <input
            name="prefillSources"
            type="hidden"
            value={JSON.stringify(prefillData.sources)}
          />
          <input
            name="draftedFields"
            type="hidden"
            value={JSON.stringify(prefillData.draftedFields)}
          />
          <input name="editedFields" type="hidden" value="[]" />
          <input
            name="prefillTruncated"
            type="hidden"
            value={
              prefillData.truncated == null
                ? ""
                : prefillData.truncated
                  ? "true"
                  : "false"
            }
          />
          <input
            name="prefillError"
            type="hidden"
            value={prefillData.error || ""}
          />

          {renderTierSections("core", values, errors, {
            setValues,
            prefillState,
            draftedFields: prefillData.draftedFields,
            onAnalyzeSite: runPrefill,
            onClearDrafts: clearDrafts,
          })}

          <details className="scanner-intake-details">
            <summary className="scanner-intake-details__summary">
              Optional — the more you share, the sharper the scan
            </summary>
            <div className="scanner-intake-details__body">
              {renderTierSections("deepDive", values, errors, {
                setValues,
                prefillState,
                draftedFields: prefillData.draftedFields,
                onAnalyzeSite: runPrefill,
                onClearDrafts: clearDrafts,
              })}
            </div>
          </details>

          <div className="contact-form__honeypot" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input
              autoComplete="off"
              id="website"
              name="website"
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setValues((currentValues) => ({
                  ...currentValues,
                  website: nextValue,
                }));
              }}
              tabIndex={-1}
              type="text"
              value={values.website}
            />
          </div>

          {turnstileSiteKey ? (
            <div
              aria-label="Bot protection"
              className="cf-turnstile"
              data-sitekey={turnstileSiteKey}
              id={TURNSTILE_WIDGET_ID}
            />
          ) : null}

          <p className="development-note">
            Keep this focused on business context. Do not include secrets,
            credentials, or unnecessary personal data.{" "}
            <Link href="/privacy">Read the privacy policy</Link>.
          </p>

          <button
            className="button button--primary"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Submitting..." : "Submit intake"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
  badge?: ReactNode;
  children: ReactNode;
};

function Field({
  id,
  label,
  error,
  optional = false,
  badge,
  children,
}: FieldProps) {
  return (
    <div className="form-field">
      <label htmlFor={id}>
        <span>{label}</span>
        {optional ? <span> Optional</span> : null}
        {badge}
      </label>
      {children}
      {error ? (
        <p className="form-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function buildValidationValues(
  formData: FormData,
  creditKey: string,
): ScannerIntakeFormValues {
  const values = Object.fromEntries(
    INTAKE_FIELDS.map((field) => [
      field.key,
      field.key === "creditKey"
        ? creditKey
        : String(formData.get(field.key) || ""),
    ]),
  ) as ScannerIntakeFormValues;

  values.turnstileToken = String(formData.get("cf-turnstile-response") || "");

  return values;
}

function renderTierSections(
  tier: "core" | "deepDive",
  values: ScannerIntakeFormValues,
  errors: ScannerIntakeFormErrors,
  options: RenderTierOptions,
) {
  const fields = INTAKE_FIELDS.filter((field) => field.tier === tier);
  const groups = fields.reduce(
    (accumulator, field) => {
      accumulator[field.group].push(field);
      return accumulator;
    },
    {
      company: [],
      people: [],
      ai: [],
      goals: [],
      operations: [],
      infrastructure: [],
      constraints: [],
      delivery: [],
      meta: [],
    } as Record<IntakeField["group"], IntakeField[]>,
  );

  return (Object.entries(groupLabels) as [keyof typeof groupLabels, string][])
    .filter(([group]) => groups[group].length > 0)
    .map(([group, label]) => (
      <section className="scanner-intake-section" key={`${tier}:${group}`}>
        <div className="scanner-intake-section__header">
          <h3>{label}</h3>
        </div>
        <div className="contact-form__grid scanner-intake-grid">
          {groups[group].map((field) =>
            renderField(field, values, errors, options),
          )}
        </div>
      </section>
    ));
}

function renderField(
  field: IntakeField,
  values: ScannerIntakeFormValues,
  errors: ScannerIntakeFormErrors,
  {
    setValues,
    prefillState,
    draftedFields,
    onAnalyzeSite,
    onClearDrafts,
  }: RenderTierOptions,
) {
  const error = errors[field.key];
  const helpId = field.help ? `${field.key}-help` : undefined;
  const errorId = error ? `${field.key}-error` : undefined;
  const draftNoteId = draftedFields.includes(field.key)
    ? `${field.key}-draft-note`
    : undefined;
  const describedBy =
    [helpId, draftNoteId, errorId].filter(Boolean).join(" ") || undefined;
  const hasDraft = draftNoteId != null;
  const hasDrafts = draftedFields.length > 0;

  return (
    <Field
      id={field.key}
      key={field.key}
      label={field.label}
      error={error}
      optional={!field.required}
      badge={
        hasDraft ? (
          <span className="scanner-intake-badge">Please review</span>
        ) : null
      }
    >
      {field.input === "textarea" ? (
        <textarea
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          id={field.key}
          maxLength={field.maxLength}
          name={field.key}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setValues((currentValues) => ({
              ...currentValues,
              [field.key]: nextValue,
            }));
          }}
          required={field.required}
          rows={field.rows}
          value={values[field.key]}
        />
      ) : (
        <input
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          id={field.key}
          maxLength={field.maxLength}
          name={field.key}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setValues((currentValues) => ({
              ...currentValues,
              [field.key]: nextValue,
            }));
          }}
          required={field.required}
          type={field.input}
          value={values[field.key]}
        />
      )}
      {field.key === "companyWebsite" ? (
        <div className="scanner-intake-prefill">
          <div className="scanner-intake-prefill__actions">
            <button
              className="button button--secondary"
              disabled={prefillState === "analyzing"}
              onClick={() => void onAnalyzeSite()}
              type="button"
            >
              {hasDrafts ? "Re-analyze" : "Analyze my site"}
            </button>
            {hasDrafts ? (
              <button
                className="button button--ghost"
                onClick={onClearDrafts}
                type="button"
              >
                Clear drafts
              </button>
            ) : null}
          </div>
          <p className="scanner-intake-field-help">
            {scannerContent.intakePage.analyzeHint}
          </p>
          {prefillState === "failed" ? (
            <p className="development-note" role="status">
              We couldn&apos;t read your site. Fill the form in as normal.
            </p>
          ) : null}
        </div>
      ) : null}
      {field.help ? (
        <p className="scanner-intake-field-help" id={helpId}>
          {field.help}
        </p>
      ) : null}
      {draftNoteId ? (
        <p className="scanner-intake-field-help" id={draftNoteId}>
          Drafted from your website — please review and correct everything
          before submitting.
        </p>
      ) : null}
    </Field>
  );
}

function syncHiddenInput(form: HTMLFormElement, name: string, value: string) {
  const input = form.elements.namedItem(name);
  if (input instanceof HTMLInputElement) {
    input.value = value;
  }
}
