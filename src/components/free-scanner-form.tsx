"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

import { FUTCO_META_PIXEL_ID, ensureMetaPixel, trackMetaPixelEvent } from "@/lib/meta-pixel";

import {
  FREE_INTAKE_FIELDS,
  mergeFreeScannerIntakeDraft,
  type FreeScannerFormState,
  type FreeScannerIntakeDraft,
  type FreeScannerIntakeFieldKey,
  type FreeScannerIntakeValues,
} from "@/lib/scanner-free-intake";
import { FreeLeadCapture } from "@/components/free-lead-capture";
import type { FreeLeadFormState } from "@/lib/scanner-free-lead";
import { mountTurnstileWidget, resetTurnstileWidget } from "@/lib/turnstile-widget";

const TURNSTILE_WIDGET_ID = "free-scanner-turnstile";

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

type PrefillStatus = "idle" | "analyzing" | "done" | "failed";

type PrefillResponse =
  | { ok: true; draft: FreeScannerIntakeDraft }
  | { ok: false; reason: string };

// Plain-language reason a site could not be pre-filled. None of these block
// the free summary -- the visitor can always describe their business by hand.
function prefillFailureMessage(reason: string) {
  switch (reason) {
    case "fetch_failed":
    case "blocked_host":
    case "not_html":
      return "That site doesn't let automated tools read it, so we couldn't pre-fill. Just describe your business below — it takes about a minute.";
    case "timeout":
      return "That site took too long to respond, so we couldn't pre-fill. Just describe your business below — it takes about a minute.";
    default:
      return "We couldn't pre-fill from that site. Just describe your business below — it takes about a minute.";
  }
}

export function FreeScannerForm({
  action,
  initialState,
  leadAction,
  turnstileSiteKey = "",
}: FreeScannerFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [values, setValues] = useState<FreeScannerIntakeValues>(state.values);
  const [prefillState, setPrefillState] = useState<PrefillStatus>("idle");
  const [prefillFailureReason, setPrefillFailureReason] = useState("");
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

  useEffect(() => {
    if (state.status !== "success") return;
    // Generating a summary is not a lead -- nobody has given us any contact
    // information yet. The Lead event fires when they ask for it by email
    // (see free-lead-capture.tsx).
    ensureMetaPixel(FUTCO_META_PIXEL_ID);
    trackMetaPixelEvent("FreeSummaryGenerated", { custom: true });
  }, [state.status]);

  // Explicit rendering, triggered by a ref callback that fires exactly when
  // the container is attached, rather than Cloudflare's implicit
  // `data-sitekey` auto-render (which only scans the DOM once, at script
  // load time, and never picks up a container that appears later).
  const turnstileCleanupRef = useRef<(() => void) | null>(null);
  const setTurnstileContainer = useCallback(
    (node: HTMLDivElement | null) => {
      turnstileCleanupRef.current?.();
      turnstileCleanupRef.current = null;
      if (!node || !turnstileSiteKey) return;
      setTurnstileFailed(false);
      setTurnstileScriptBlocked(false);
      turnstileCleanupRef.current = mountTurnstileWidget(
        node,
        {
          sitekey: turnstileSiteKey,
          appearance: "always",
          callback: () => setTurnstileFailed(false),
          "error-callback": () => setTurnstileFailed(true),
          "expired-callback": () => setTurnstileFailed(true),
        },
        () => setTurnstileScriptBlocked(true),
      );
    },
    [turnstileSiteKey],
  );

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

  async function runPrefill() {
    const website = values.companyWebsite.trim();
    if (!website) {
      setPrefillFailureReason("");
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
        setPrefillFailureReason(payload.reason);
        setPrefillState("failed");
        return;
      }
      const merged = mergeFreeScannerIntakeDraft(values, payload.draft);
      setValues(merged.values);
      setDraftedFields(merged.draftedFields);
      setPrefillState("done");
    } catch {
      setPrefillFailureReason("");
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
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              setValues((current) => ({ ...current, companyWebsite: nextValue }));
            }}
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
        {prefillState === "done" && draftedFields.length === 0 ? (
          <p className="development-note">
            We didn&apos;t find much readable text on that page, so there was nothing to pre-fill.
            Just describe your business below — it takes about a minute.
          </p>
        ) : null}
        {prefillState === "failed" ? (
          <p className="development-note">{prefillFailureMessage(prefillFailureReason)}</p>
        ) : null}
      </Field>

      {FREE_INTAKE_FIELDS.filter((field) => field.key !== "companyWebsite").map((field) => (
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
      ) : null}

      {state.errors.form ? (
        <p className="form-error form-error--summary" role="alert">
          {state.errors.form}
        </p>
      ) : null}

      <p className="development-note">
        No payment, no account. Read the{" "}
        <a href="https://futco.ai/privacy">privacy policy</a>.
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
