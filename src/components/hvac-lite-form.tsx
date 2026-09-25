"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { hvacLiteContent } from "@/content/hvac-content";
import { getScannerCampaign } from "@/lib/scanner-campaigns";
import { ensureMetaPixel, trackMetaPixelEvent } from "@/lib/meta-pixel";
import type { HvacLiteFormState, HvacLiteIntakeValues } from "@/lib/scanner-lite-intake";
import { mountTurnstileWidget, resetTurnstileWidget } from "@/lib/turnstile-widget";

const TURNSTILE_WIDGET_ID = "hvac-lite-turnstile";
const metaPixelId = getScannerCampaign("hvac_lite")?.metaPixelId ?? "";

type HvacLiteFormProps = {
  action: (
    previousState: HvacLiteFormState,
    formData: FormData,
  ) => Promise<HvacLiteFormState>;
  initialState: HvacLiteFormState;
  turnstileSiteKey?: string;
};

export function HvacLiteForm({
  action,
  initialState,
  turnstileSiteKey = "",
}: HvacLiteFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [values, setValues] = useState<HvacLiteIntakeValues>(state.values);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const [turnstileScriptBlocked, setTurnstileScriptBlocked] = useState(false);

  useEffect(() => {
    ensureMetaPixel(metaPixelId);
    trackMetaPixelEvent("PageView");
  }, []);

  useEffect(() => {
    if (state.status !== "error") return;
    resetTurnstileWidget(TURNSTILE_WIDGET_ID);
  }, [state]);

  useEffect(() => {
    if (state.status !== "success") return;
    trackMetaPixelEvent("CompleteRegistration");
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
        <h2>{hvacLiteContent.success.heading}</h2>
        <p>{hvacLiteContent.success.body}</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="contact-form"
      noValidate
      onSubmit={() => trackMetaPixelEvent("Lead")}
    >
      <div className="contact-form__header">
        <h2>{hvacLiteContent.form.heading}</h2>
      </div>

      <div className="form-field">
        <label htmlFor="companyWebsite">
          <span>{hvacLiteContent.form.websiteLabel}</span>
        </label>
        <input
          id="companyWebsite"
          maxLength={200}
          name="companyWebsite"
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setValues((current) => ({ ...current, companyWebsite: nextValue }));
          }}
          placeholder="https://yourhvaccompany.com"
          type="url"
          value={values.companyWebsite}
        />
        {state.errors.companyWebsite ? (
          <p className="form-error" id="companyWebsite-error">
            {state.errors.companyWebsite}
          </p>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="workEmail">
          <span>{hvacLiteContent.form.emailLabel}</span>
        </label>
        <input
          id="workEmail"
          maxLength={200}
          name="workEmail"
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setValues((current) => ({ ...current, workEmail: nextValue }));
          }}
          type="email"
          value={values.workEmail}
        />
        {state.errors.workEmail ? (
          <p className="form-error" id="workEmail-error">
            {state.errors.workEmail}
          </p>
        ) : null}
        <p className="development-note">{hvacLiteContent.form.emailNotice}</p>
      </div>

      <div className="contact-form__consent">
        <input
          checked={values.marketingOptIn}
          id="marketingOptIn"
          name="marketingOptIn"
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            setValues((current) => ({ ...current, marketingOptIn: checked }));
          }}
          type="checkbox"
        />
        <label htmlFor="marketingOptIn">{hvacLiteContent.form.consentLabel}</label>
      </div>

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
          privacy extension, or network filtering blocking that domain --
          please allow it and reload, or try a different browser/network.
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

      <button className="button button--primary" disabled={isPending} type="submit">
        {isPending ? hvacLiteContent.form.pendingLabel : hvacLiteContent.form.submitLabel}
      </button>
    </form>
  );
}
