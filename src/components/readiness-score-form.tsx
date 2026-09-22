"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

import {
  READINESS_DIMENSIONS,
  type ReadinessDimensionKey,
  type ReadinessScoreFormErrors,
  type ReadinessScoreFormState,
} from "@/lib/readiness-score";

type ReadinessScoreFormProps = {
  action: (
    previousState: ReadinessScoreFormState,
    formData: FormData,
  ) => Promise<ReadinessScoreFormState>;
  initialState: ReadinessScoreFormState;
};

export function ReadinessScoreForm({
  action,
  initialState,
}: ReadinessScoreFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  const fieldErrorEntries = READINESS_DIMENSIONS.flatMap((dimension) => {
    const message = state.errors[dimension.key];
    return message ? [{ key: dimension.key, label: dimension.label, message }] : [];
  });
  const hasSummaryError =
    state.status === "error" &&
    (fieldErrorEntries.length > 0 || Boolean(state.errors.form));

  return (
    <div className="readiness-score-layout">
      <form action={formAction} className="contact-form" noValidate>
        <div className="contact-form__header">
          <h2>AI readiness self-assessment</h2>
          <p>
            Answer five dropdown questions for a fast, generic score. No account,
            no payment, and no personalized analysis is performed here.
          </p>
        </div>

        {hasSummaryError ? (
          <div
            aria-labelledby="readiness-score-errors-title"
            className="form-error form-error--summary"
            role="alert"
          >
            <p id="readiness-score-errors-title">
              {state.errors.form ?? "Review the highlighted fields."}
            </p>
            <ul className="readiness-score-errors">
              {fieldErrorEntries.map((error) => (
                <li key={error.key}>
                  <a href={`#${error.key}`}>{error.label}</a>: {error.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="readiness-score-grid">
          {READINESS_DIMENSIONS.map((dimension) => (
            <Field
              error={state.errors[dimension.key]}
              id={dimension.key}
              key={dimension.key}
              label={dimension.label}
            >
              <p className="readiness-score-field__prompt" id={`${dimension.key}-prompt`}>
                {dimension.prompt}
              </p>
              <select
                aria-describedby={buildDescribedBy(dimension.key, state.errors)}
                aria-invalid={state.errors[dimension.key] ? "true" : undefined}
                defaultValue={state.values[dimension.key]}
                id={dimension.key}
                key={`${dimension.key}:${state.values[dimension.key]}`}
                name={dimension.key}
              >
                <option value="">Select a level</option>
                {dimension.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}. {option.label}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>

        {isPending ? (
          <p aria-live="polite" className="state-loading" role="status">
            Calculating your readiness score...
          </p>
        ) : null}

        <p className="development-note">
          This readiness score is a quick self-assessment. The paid scan supplies
          specific opportunities, supporting evidence, and a full plan.
        </p>

        <button className="button button--primary" disabled={isPending} type="submit">
          {isPending ? "Calculating..." : "Calculate my readiness score"}
        </button>
      </form>

      {state.status === "success" && state.result ? (
        <section
          aria-atomic="true"
          aria-live="polite"
          className="content-panel readiness-score-result"
          role="status"
        >
          <p className="section-heading__eyebrow">Instant result</p>
          <div className="readiness-score-result__headline">
            <p className="readiness-score-result__score">{state.result.score}/100</p>
            <div className="readiness-score-result__copy">
              <h2>{state.result.band.name}</h2>
              <p>{state.result.band.explanation}</p>
            </div>
          </div>
          <p className="readiness-score-result__note">
            This is a quick self-assessment, not personalized analysis. The paid
            scan identifies your specific opportunities and delivers a full plan.
          </p>
          <Link className="button button--primary readiness-score-result__cta" href="/">
            See your specific opportunities — unlock the $99 scan
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: ReadinessDimensionKey;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="form-field readiness-score-field">
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

function buildDescribedBy(id: ReadinessDimensionKey, errors: ReadinessScoreFormErrors) {
  return errors[id] ? `${id}-prompt ${id}-error` : `${id}-prompt`;
}
