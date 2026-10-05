"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { FUTCO_META_PIXEL_ID, ensureMetaPixel, trackMetaPixelEvent } from "@/lib/meta-pixel";
import { emptyFreeLeadValues, type FreeLeadFormState } from "@/lib/scanner-free-lead";
import { mountTurnstileWidget, resetTurnstileWidget } from "@/lib/turnstile-widget";

const TURNSTILE_WIDGET_ID = "free-lead-turnstile";

type FreeLeadCaptureProps = {
  action: (previousState: FreeLeadFormState, formData: FormData) => Promise<FreeLeadFormState>;
  summaryToken: string;
  turnstileSiteKey?: string;
};

// Shown under the free summary: the optional step that turns a visitor who got
// value into a contact. The only personal data asked for is an email address.
export function FreeLeadCapture({
  action,
  summaryToken,
  turnstileSiteKey = "",
}: FreeLeadCaptureProps) {
  const [state, formAction, isPending] = useActionState<FreeLeadFormState, FormData>(
    action,
    { status: "idle", values: { ...emptyFreeLeadValues, summaryToken }, errors: {} },
  );
  const [email, setEmail] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const [turnstileScriptBlocked, setTurnstileScriptBlocked] = useState(false);

  useEffect(() => {
    if (state.status !== "error") return;
    resetTurnstileWidget(TURNSTILE_WIDGET_ID);
  }, [state]);

  // The real lead event: a person gave us an email address.
  useEffect(() => {
    if (state.status !== "success") return;
    ensureMetaPixel(FUTCO_META_PIXEL_ID);
    trackMetaPixelEvent("Lead");
  }, [state.status]);

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

  if (state.status === "success") {
    return (
      <div className="contact-confirmation content-panel">
        <h3>Sent — check your inbox</h3>
        <p>
          Your summary is on its way to {email || "your email"}, along with an invite to a
          quick call. If you don&apos;t see it in a minute or two, check your spam folder.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="contact-form content-panel" noValidate>
      <div className="contact-form__header">
        <h3>Want this summary in your inbox?</h3>
        <p>
          We&apos;ll email it to you, along with an invite to a free 20-minute call to talk
          through it. Just your email — no account needed.
        </p>
      </div>

      <input name="summaryToken" type="hidden" value={summaryToken} />

      <div className="form-field">
        <label htmlFor="free-lead-email">
          <span>Email address</span>
        </label>
        <input
          autoComplete="email"
          id="free-lead-email"
          maxLength={200}
          name="email"
          onChange={(event) => setEmail(event.currentTarget.value)}
          type="email"
          value={email}
        />
        {state.errors.email ? (
          <p className="form-error" id="free-lead-email-error">
            {state.errors.email}
          </p>
        ) : null}
      </div>

      <div className="contact-form__consent">
        <input
          checked={marketingOptIn}
          id="free-lead-marketing"
          name="marketingOptIn"
          onChange={(event) => setMarketingOptIn(event.currentTarget.checked)}
          type="checkbox"
        />
        <label htmlFor="free-lead-marketing">
          Send me occasional ideas and future communications from FutCo about improving my
          business with simple AI solutions. I can unsubscribe at any time.
        </label>
      </div>

      <div className="contact-form__honeypot" aria-hidden="true">
        <label htmlFor="free-lead-website">Website</label>
        <input autoComplete="off" id="free-lead-website" name="website" tabIndex={-1} type="text" />
      </div>

      {turnstileSiteKey ? (
        <div aria-label="Bot protection" id={TURNSTILE_WIDGET_ID} ref={setTurnstileContainer} />
      ) : null}
      {turnstileScriptBlocked ? (
        <p className="form-error" role="alert">
          The bot-verification script from challenges.cloudflare.com never loaded in this
          browser. This is almost always an ad blocker, privacy extension, or network
          filtering blocking that domain — please allow it and reload, or try a different
          browser.
        </p>
      ) : turnstileFailed ? (
        <p className="form-error" role="alert">
          Bot verification couldn&apos;t load. If you use an ad blocker or strict tracking
          protection, please allow challenges.cloudflare.com and reload this page.
        </p>
      ) : null}

      {state.errors.form ? (
        <p className="form-error form-error--summary" role="alert">
          {state.errors.form}
        </p>
      ) : null}

      <button className="button button--primary" disabled={isPending} type="submit">
        {isPending ? "Sending..." : "Email me this summary"}
      </button>
    </form>
  );
}
