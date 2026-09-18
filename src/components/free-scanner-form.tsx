"use client";

import { useActionState, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

import {
  FREE_INTAKE_FIELDS,
  mergeFreeScannerIntakeDraft,
  type FreeScannerFormState,
  type FreeScannerIntakeDraft,
  type FreeScannerIntakeFieldKey,
  type FreeScannerIntakeValues,
} from "@/lib/scanner-free-intake";
import {
  registerTurnstileCallback,
  resetTurnstileWidget,
  watchForBlockedTurnstileScript,
} from "@/lib/turnstile-widget";

const TURNSTILE_WIDGET_ID = "free-scanner-turnstile";
const TURNSTILE_FAILURE_CALLBACK = "oppscanFreeScannerTurnstileFailed";
const TURNSTILE_SUCCESS_CALLBACK = "oppscanFreeScannerTurnstileSolved";

type FreeScannerFormProps = {
  action: (
    previousState: FreeScannerFormState,
    formData: FormData,
  ) => Promise<FreeScannerFormState>;
  initialState: FreeScannerFormState;
  turnstileSiteKey?: string;
};

type PrefillStatus = "idle" | "analyzing" | "done" | "failed";

type PrefillResponse =
  | { ok: true; draft: FreeScannerIntakeDraft }
  | { ok: false; reason: string };

export function FreeScannerForm({
  action,
  initialState,
  turnstileSiteKey = "",
}: FreeScannerFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [values, setValues] = useState<FreeScannerIntakeValues>(state.values);
  const [prefillState, setPrefillState] = useState<PrefillStatus>("idle");
  const [draftedFields, setDraftedFields] = useState<FreeScannerIntakeFieldKey[]>([]);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const [turnstileScriptBlocked, setTurnstileScriptBlocked] = useState(false);

  // A stale or already-verified Turnstile token left in the widget after a
  // failed submission would fail the same way on a plain resubmit, so force
  // a fresh challenge/token any time the server rejects the form.
  useEffect(() => {
    if (state.status !== "error") return;
    resetTurnstileWidget(TURNSTILE_WIDGET_ID);
  }, [state]);

  // An ad blocker, privacy extension, or strict tracking protection can
  // prevent the widget from ever producing a token, which otherwise only
  // surfaces as a vague "please try again" after a full failed submission.
  useEffect(() => {
    const unregisterFailure = registerTurnstileCallback(
      TURNSTILE_FAILURE_CALLBACK,
      () => setTurnstileFailed(true),
    );
    const unregisterSuccess = registerTurnstileCallback(
      TURNSTILE_SUCCESS_CALLBACK,
      () => setTurnstileFailed(false),
    );
    return () => {
      unregisterFailure();
      unregisterSuccess();
    };
  }, []);

  // If the Cloudflare script itself never loads (blocked by an ad blocker,
  // privacy extension, or network filtering), the widget's own callbacks
  // never fire because the code that would call them never runs -- this
  // catches that case directly instead of leaving the widget area silently
  // blank.
  useEffect(() => {
    if (!turnstileSiteKey) return;
    return watchForBlockedTurnstileScript(() => setTurnstileScriptBlocked(true));
  }, [turnstileSiteKey]);

  if (state.status === "success" && state.candidates) {
    return (
      <div className="page-stack scanner-report">
        <header className="content-panel">
          <p className="section-heading__eyebrow">FREE SUMMARY</p>
          <h2>Your top AI opportunities</h2>
          <p>
            Showing {state.candidates.length} of {state.totalFound} opportunities
            we found. The paid scan unlocks all of them, evidence, first
            steps, a full written report, and a consultation with FutCo.
          </p>
        </header>
        {state.candidates.map((candidate) => (
          <section className="content-panel" key={candidate.id}>
            <p className="section-heading__eyebrow">
              {candidate.outcomeType.toUpperCase().replace("-", " ")}
            </p>
            <h3>{candidate.title}</h3>
            <p>{candidate.summary}</p>
          </section>
        ))}
        <div className="content-panel">
          <Link className="button button--primary" href="/">
            Unlock the full report + consultation ($99)
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="contact-confirmation content-panel">
        <p>Thanks — your submission was received.</p>
      </div>
    );
  }

  async function runPrefill() {
    const website = values.companyWebsite.trim();
    if (!website) {
      setPrefillState("failed");
      return;
    }

    setPrefillState("analyzing");
    try {
      const response = await fetch("/api/free-intake/prefill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ website }),
      });
      const payload = (await response.json()) as PrefillResponse;
      if (!payload.ok) {
        setPrefillState("failed");
        return;
      }
      const merged = mergeFreeScannerIntakeDraft(values, payload.draft);
      setValues(merged.values);
      setDraftedFields(merged.draftedFields);
      setPrefillState("done");
    } catch {
      setPrefillState("failed");
    }
  }

  return (
    <form action={formAction} className="contact-form" noValidate>
      <div className="contact-form__header">
        <h2>Business snapshot</h2>
        <p>Analyze your site to draft a few fields, or just fill them in — takes about a minute either way.</p>
      </div>

      <Field error={state.errors.companyWebsite} id="companyWebsite" label="Company website">
        <div className="scanner-intake-prefill">
          <input
            id="companyWebsite"
            maxLength={200}
            name="companyWebsite"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                companyWebsite: event.currentTarget.value,
              }))
            }
            type="url"
            value={values.companyWebsite}
          />
          <div className="scanner-intake-prefill__actions">
            <button
              className="button button--secondary button--compact"
              disabled={prefillState === "analyzing"}
              onClick={() => void runPrefill()}
              type="button"
            >
              {prefillState === "analyzing" ? "Analyzing..." : "Analyze my site"}
            </button>
          </div>
        </div>
        {prefillState === "done" && draftedFields.length > 0 ? (
          <p className="development-note">
            Drafted {draftedFields.length} field{draftedFields.length === 1 ? "" : "s"} from your
            site — review and edit below.
          </p>
        ) : null}
        {prefillState === "failed" ? (
          <p className="development-note">
            Couldn&apos;t analyze that site — fill in the fields below manually.
          </p>
        ) : null}
      </Field>

      {FREE_INTAKE_FIELDS.filter((field) => field.key !== "companyWebsite").map((field) => (
        <Field error={state.errors[field.key]} id={field.key} key={field.key} label={field.label}>
          {field.input === "textarea" ? (
            <textarea
              id={field.key}
              maxLength={field.maxLength}
              name={field.key}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.key]: event.currentTarget.value,
                }))
              }
              rows={field.rows ?? 4}
              value={values[field.key]}
            />
          ) : (
            <input
              id={field.key}
              maxLength={field.maxLength}
              name={field.key}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.key]: event.currentTarget.value,
                }))
              }
              type="text"
              value={values[field.key]}
            />
          )}
        </Field>
      ))}

      <div className="contact-form__honeypot" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          autoComplete="off"
          defaultValue={state.values.website}
          id="website"
          name="website"
          tabIndex={-1}
          type="text"
        />
      </div>

      {turnstileSiteKey ? (
        <div
          aria-label="Bot protection"
          className="cf-turnstile"
          data-appearance="always"
          data-callback={TURNSTILE_SUCCESS_CALLBACK}
          data-error-callback={TURNSTILE_FAILURE_CALLBACK}
          data-expired-callback={TURNSTILE_FAILURE_CALLBACK}
          data-sitekey={turnstileSiteKey}
          id={TURNSTILE_WIDGET_ID}
        />
      ) : null}
      {turnstileScriptBlocked ? (
        <p className="form-error" role="alert">
          The bot-verification script from challenges.cloudflare.com never
          loaded in this browser. This is almost always an ad blocker,
          privacy extension (e.g. Brave Shields, uBlock Origin), or network
          filtering blocking that domain — please allow it and reload, or
          try a different browser/network.
        </p>
      ) : turnstileFailed ? (
        <p className="form-error" role="alert">
          Bot verification couldn&apos;t load. If you use an ad blocker,
          privacy extension, or strict tracking protection, please allow{" "}
          challenges.cloudflare.com and reload this page. If it still
          doesn&apos;t work, try a different browser.
        </p>
      ) : null}

      {state.errors.form ? (
        <p className="form-error form-error--summary" role="alert">
          {state.errors.form}
        </p>
      ) : null}

      <p className="development-note">
        No payment, no account. Read the{" "}
        <a href="https://applied.futco.ai/privacy">privacy policy</a>.
      </p>

      <button className="button button--primary" disabled={isPending} type="submit">
        {isPending ? "Generating..." : "Get my free summary"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: FreeScannerIntakeFieldKey;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>
        <span>{label}</span>
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
