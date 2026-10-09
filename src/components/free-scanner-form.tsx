"use client";

import { useActionState, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

import { FUTCO_META_PIXEL_ID, ensureMetaPixel, trackMetaPixelEvent } from "@/lib/meta-pixel";

import {
  FREE_INTAKE_FIELDS,
  type FreeScannerFormState,
  type FreeScannerIntakeFieldKey,
  type FreeScannerIntakeValues,
} from "@/lib/scanner-free-intake";
import { FreeLeadCapture } from "@/components/free-lead-capture";
import type { FreeLeadFormState } from "@/lib/scanner-free-lead";
import { useFunnelTracking } from "@/lib/use-funnel-tracking";
import { useTurnstile } from "@/lib/use-turnstile";

const TURNSTILE_WIDGET_ID = "free-scanner-turnstile";

const OPTIONAL_FIELD_KEYS: FreeScannerIntakeFieldKey[] = FREE_INTAKE_FIELDS.filter(
  (field) => !field.required,
).map((field) => field.key);

type FreeScannerFormProps = {
  action: (
    previousState: FreeScannerFormState,
    formData: FormData,
  ) => Promise<FreeScannerFormState>;
  initialState: FreeScannerFormState;
  // The optional "email me this summary" step shown under the results.
  leadAction?: (
    previousState: FreeLeadFormState,
    formData: FormData,
  ) => Promise<FreeLeadFormState>;
  turnstileSiteKey?: string;
};

export function FreeScannerForm({
  action,
  initialState,
  leadAction,
  turnstileSiteKey = "",
}: FreeScannerFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [values, setValues] = useState<FreeScannerIntakeValues>(state.values);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // If the problem is in one of the optional detail fields -- most often
  // "we couldn't read your site, add a sentence" -- keep the section open so
  // the message and the field are in view.
  const hasDetailError = OPTIONAL_FIELD_KEYS.some((key) => state.errors[key]);
  const {
    containerRef: setTurnstileContainer,
    failed: turnstileFailed,
    scriptBlocked: turnstileScriptBlocked,
    verifying: turnstileVerifying,
    timedOut: turnstileTimedOut,
    guardSubmit,
    reset: resetTurnstile,
  } = useTurnstile(TURNSTILE_WIDGET_ID, turnstileSiteKey, "free");
  const { onFocus: handleFormFocus, trackTap } = useFunnelTracking("free", state);

  // A stale or already-verified Turnstile token left in the widget after a
  // failed submission would fail the same way on a plain resubmit, so force
  // a fresh challenge/token any time the server rejects the form.
  useEffect(() => {
    if (state.status !== "error") return;
    resetTurnstile();
  }, [state, resetTurnstile]);

  // When the site couldn't be read, the one thing the visitor can do is type a
  // description, so put the cursor there rather than leaving them to find it.
  useEffect(() => {
    if (state.status !== "error" || !state.errors.companyDescription) return;
    document.getElementById("companyDescription")?.focus();
  }, [state]);

  useEffect(() => {
    if (state.status !== "success") return;
    // Generating a summary is not a lead -- nobody has given us any contact
    // information yet. The Lead event fires when they ask for it by email
    // (see free-lead-capture.tsx).
    ensureMetaPixel(FUTCO_META_PIXEL_ID);
    trackMetaPixelEvent("FreeSummaryGenerated", { custom: true });
  }, [state.status]);

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
        {leadAction && state.summaryToken ? (
          <FreeLeadCapture
            action={leadAction}
            summaryToken={state.summaryToken}
            turnstileSiteKey={turnstileSiteKey}
          />
        ) : null}
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

  return (
    <form
      action={formAction}
      className="contact-form"
      noValidate
      onFocus={handleFormFocus}
      onSubmit={(event) => {
        trackTap();
        guardSubmit(event);
      }}
    >
      <div className="contact-form__header">
        <h2>Where could AI help your business?</h2>
      </div>

      <Field error={state.errors.companyWebsite} id="companyWebsite" label="Company website">
        <input
          autoCapitalize="none"
          autoComplete="url"
          autoCorrect="off"
          enterKeyHint="go"
          id="companyWebsite"
          inputMode="url"
          maxLength={200}
          name="companyWebsite"
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setValues((current) => ({ ...current, companyWebsite: nextValue }));
          }}
          placeholder="yourcompany.com"
          spellCheck={false}
          type="url"
          value={values.companyWebsite}
        />
      </Field>

      <details
        className="form-field"
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        open={detailsOpen || hasDetailError}
      >
        <summary>Add details for a sharper summary (optional)</summary>
        {FREE_INTAKE_FIELDS.filter((field) => !field.required).map((field) => (
          <Field error={state.errors[field.key]} id={field.key} key={field.key} label={field.label}>
            {field.input === "textarea" ? (
              <textarea
                id={field.key}
                maxLength={field.maxLength}
                name={field.key}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setValues((current) => ({ ...current, [field.key]: nextValue }));
                }}
                rows={field.rows ?? 4}
                value={values[field.key]}
              />
            ) : (
              <input
                id={field.key}
                maxLength={field.maxLength}
                name={field.key}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setValues((current) => ({ ...current, [field.key]: nextValue }));
                }}
                type="text"
                value={values[field.key]}
              />
            )}
          </Field>
        ))}
      </details>

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
        <div aria-label="Bot protection" id={TURNSTILE_WIDGET_ID} ref={setTurnstileContainer} />
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
      ) : turnstileTimedOut ? (
        <p className="form-error" role="alert">
          The verification check is taking longer than usual. Please complete it above, then
          tap the button again.
        </p>
      ) : null}

      {state.errors.form ? (
        <p className="form-error form-error--summary" role="alert">
          {state.errors.form}
        </p>
      ) : null}

      <p className="development-note">
        We only read your public website. See an{" "}
        <Link href="/example">example of the full report</Link>, or read the{" "}
        <a href="https://futco.ai/privacy">privacy policy</a>.
      </p>

      <button
        className="button button--primary"
        disabled={isPending || turnstileVerifying}
        type="submit"
      >
        {isPending
          ? "Reading your website..."
          : turnstileVerifying
            ? "Verifying..."
            : "Show my top AI opportunities"}
      </button>
      {isPending ? (
        <p className="development-note" role="status">
          This takes about a minute. We&apos;re reading your site and finding your top
          opportunities — please keep this page open.
        </p>
      ) : null}
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
