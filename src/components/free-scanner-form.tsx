"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

import {
  FREE_INTAKE_FIELDS,
  type FreeScannerFormState,
  type FreeScannerIntakeFieldKey,
} from "@/lib/scanner-free-intake";

type FreeScannerFormProps = {
  action: (
    previousState: FreeScannerFormState,
    formData: FormData,
  ) => Promise<FreeScannerFormState>;
  initialState: FreeScannerFormState;
  turnstileSiteKey?: string;
};

export function FreeScannerForm({
  action,
  initialState,
  turnstileSiteKey = "",
}: FreeScannerFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

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

  return (
    <form action={formAction} className="contact-form" noValidate>
      <div className="contact-form__header">
        <h2>Business snapshot</h2>
        <p>Six quick questions — takes about a minute.</p>
      </div>

      {FREE_INTAKE_FIELDS.map((field) => (
        <Field error={state.errors[field.key]} id={field.key} key={field.key} label={field.label}>
          {field.input === "textarea" ? (
            <textarea
              defaultValue={state.values[field.key]}
              id={field.key}
              maxLength={field.maxLength}
              name={field.key}
              rows={field.rows ?? 4}
            />
          ) : (
            <input
              defaultValue={state.values[field.key]}
              id={field.key}
              maxLength={field.maxLength}
              name={field.key}
              type="text"
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
          data-sitekey={turnstileSiteKey}
        />
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
