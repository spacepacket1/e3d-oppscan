import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { trackFunnelEvent, type FunnelForm } from "@/lib/funnel-events";
import { mountTurnstileWidget, resetTurnstileWidget } from "@/lib/turnstile-widget";

// One place for the Cloudflare Turnstile wiring the free summary, its email
// capture and the HVAC form all need. The widget runs in "interaction-only"
// mode: it checks the visitor invisibly and only shows a challenge if it
// suspects a bot, so most people never see a "Verify you are human" box.
//
// The submit button is never locked while that check runs. Holding it on a
// "Getting ready..." state cost us visitors: ad traffic arrives on phones and
// in-app browsers where the invisible check can be slow or silently stuck, and
// a dead-looking button is where cold traffic leaves. Instead, a tap with no
// token yet is held by `guardSubmit`, which waits for the check to finish and
// then submits for the visitor. If the check is still not done after
// SUBMIT_WAIT_MS the widget is re-rendered in "always" mode so they get the
// visible checkbox, with a message telling them to complete it and tap again.
// If it errors or the script is blocked, the usual message shows right away.
//
// Independently of any tap, if no token has arrived after READY_FALLBACK_MS the
// widget is re-rendered visibly, so a visitor in a browser that handles
// invisible checks poorly still gets a way through.
const READY_FALLBACK_MS = 8000;
const SUBMIT_WAIT_MS = 15000;
const POLL_MS = 100;
const TOKEN_FIELD = "cf-turnstile-response";

export function formHasTurnstileToken(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>(`input[name="${TOKEN_FIELD}"]`);
  return Boolean(input?.value);
}

export function useTurnstile(widgetId: string, siteKey: string, funnelForm?: FunnelForm) {
  const [ready, setReady] = useState(!siteKey);
  const [failed, setFailed] = useState(false);
  const [scriptBlocked, setScriptBlocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const showedVisibleRef = useRef(false);
  const mountedAtRef = useRef(0);
  const reportedReadyRef = useRef(false);
  const failedRef = useRef(false);
  const blockedRef = useRef(false);
  const verifyingRef = useRef(false);
  const unmountedRef = useRef(false);

  const track = useCallback(
    (step: "check_ready" | "check_error" | "check_blocked" | "check_timeout", ms?: number) => {
      if (!funnelForm) return;
      trackFunnelEvent(funnelForm, step, ms === undefined ? {} : { ms });
    },
    [funnelForm],
  );

  const mount = useCallback(
    (appearance: "interaction-only" | "always") => {
      const node = nodeRef.current;
      if (!node || !siteKey) return;
      cleanupRef.current?.();
      cleanupRef.current = mountTurnstileWidget(
        node,
        {
          sitekey: siteKey,
          appearance,
          callback: () => {
            failedRef.current = false;
            setFailed(false);
            setTimedOut(false);
            setReady(true);
            if (!reportedReadyRef.current) {
              reportedReadyRef.current = true;
              track("check_ready", Date.now() - mountedAtRef.current);
            }
          },
          "error-callback": () => {
            failedRef.current = true;
            setFailed(true);
            track("check_error", Date.now() - mountedAtRef.current);
          },
          // Turnstile refreshes an expired token on its own and calls back
          // again, so this is not a failure; submits just wait for the new one.
          "expired-callback": () => setReady(false),
        },
        () => {
          blockedRef.current = true;
          setScriptBlocked(true);
          track("check_blocked", Date.now() - mountedAtRef.current);
        },
      );
    },
    [siteKey, track],
  );

  // Explicit rendering, triggered by a ref callback that fires exactly when the
  // container is attached (see turnstile-widget.ts for why).
  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      nodeRef.current = node;
      if (!node || !siteKey) return;
      failedRef.current = false;
      blockedRef.current = false;
      mountedAtRef.current = Date.now();
      setFailed(false);
      setScriptBlocked(false);
      mount("interaction-only");
    },
    [siteKey, mount],
  );

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!siteKey || ready) return;
    const timer = window.setTimeout(() => {
      // Still no token: make the check visible once so the visitor can
      // complete it by hand. Only worth re-rendering if the script actually
      // loaded; if it never did, the original mount reports "script blocked"
      // on its own shortly.
      const scriptLoaded = Boolean((window as unknown as { turnstile?: unknown }).turnstile);
      if (scriptLoaded && !showedVisibleRef.current) {
        showedVisibleRef.current = true;
        mount("always");
      }
    }, READY_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [siteKey, ready, mount]);

  const awaitToken = useCallback(
    (form: HTMLFormElement) =>
      new Promise<boolean>((resolve) => {
        verifyingRef.current = true;
        setVerifying(true);
        setTimedOut(false);
        const started = Date.now();
        const finish = (ok: boolean) => {
          verifyingRef.current = false;
          if (!unmountedRef.current) setVerifying(false);
          resolve(ok);
        };
        const tick = () => {
          if (unmountedRef.current) return finish(false);
          if (formHasTurnstileToken(form)) return finish(true);
          // Failed or blocked: stop waiting; the message for it is already on
          // screen and the visitor can retry or switch browser.
          if (failedRef.current || blockedRef.current) return finish(false);
          if (Date.now() - started >= SUBMIT_WAIT_MS) {
            const scriptLoaded = Boolean(
              (window as unknown as { turnstile?: unknown }).turnstile,
            );
            if (scriptLoaded && !showedVisibleRef.current) {
              showedVisibleRef.current = true;
              mount("always");
            }
            setTimedOut(true);
            track("check_timeout", Date.now() - started);
            return finish(false);
          }
          window.setTimeout(tick, POLL_MS);
        };
        tick();
      }),
    [mount, track],
  );

  // For a form's onSubmit. Returns true when the submission should go ahead as
  // normal (no check configured, or a token is already in the form). Otherwise
  // it cancels this submit, waits for the token, and re-submits the form itself
  // once it arrives; the caller should do nothing more for this event.
  const guardSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      if (!siteKey) return true;
      const form = event.currentTarget;
      if (formHasTurnstileToken(form)) return true;
      event.preventDefault();
      if (verifyingRef.current) return false;
      void awaitToken(form).then((ok) => {
        if (ok) form.requestSubmit();
      });
      return false;
    },
    [siteKey, awaitToken],
  );

  const reset = useCallback(() => resetTurnstileWidget(widgetId), [widgetId]);

  return {
    containerRef,
    ready,
    failed,
    scriptBlocked,
    verifying,
    timedOut,
    guardSubmit,
    reset,
  };
}
