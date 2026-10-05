import { useCallback, useEffect, useRef, useState } from "react";

import { mountTurnstileWidget, resetTurnstileWidget } from "@/lib/turnstile-widget";

// One place for the Cloudflare Turnstile wiring the free summary, its email
// capture and the HVAC form all need. The widget runs in "interaction-only"
// mode: it checks the visitor invisibly and only shows a challenge if it
// suspects a bot, so most people never see a "Verify you are human" box.
//
// Because the check is invisible, a visitor can tap submit before it has
// finished. `ready` lets the form hold its button briefly ("Getting ready...")
// instead of submitting with no token. It never strands anyone: if the check
// errors or the script is blocked, the button is enabled and the usual message
// shows. If it is merely slow or silently stuck (some in-app browsers handle
// invisible checks poorly), then after READY_FALLBACK_MS the widget is
// re-rendered in "always" mode, so the visitor gets the visible checkbox -- the
// worst case is the old behaviour, never a dead end.
const READY_FALLBACK_MS = 8000;

export function useTurnstile(widgetId: string, siteKey: string) {
  const [ready, setReady] = useState(!siteKey);
  const [failed, setFailed] = useState(false);
  const [scriptBlocked, setScriptBlocked] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const showedVisibleRef = useRef(false);

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
            setFailed(false);
            setReady(true);
          },
          "error-callback": () => setFailed(true),
          "expired-callback": () => {
            setFailed(true);
            setReady(false);
          },
        },
        () => setScriptBlocked(true),
      );
    },
    [siteKey],
  );

  // Explicit rendering, triggered by a ref callback that fires exactly when the
  // container is attached (see turnstile-widget.ts for why).
  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      nodeRef.current = node;
      if (!node || !siteKey) return;
      setFailed(false);
      setScriptBlocked(false);
      mount("interaction-only");
    },
    [siteKey, mount],
  );

  useEffect(() => {
    if (!siteKey || ready) return;
    const timer = window.setTimeout(() => {
      // Still no token: release the button, and make the check visible once so
      // the visitor can complete it by hand.
      setReady(true);
      // Only worth re-rendering if the script actually loaded; if it never did,
      // the original mount reports "script blocked" on its own shortly.
      const scriptLoaded = Boolean((window as unknown as { turnstile?: unknown }).turnstile);
      if (scriptLoaded && !showedVisibleRef.current) {
        showedVisibleRef.current = true;
        mount("always");
      }
    }, READY_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [siteKey, ready, mount]);

  const reset = useCallback(() => resetTurnstileWidget(widgetId), [widgetId]);

  // True only while the invisible check is still running and nothing has gone
  // wrong; this is when a form should hold its submit button.
  const checking = Boolean(siteKey) && !ready && !failed && !scriptBlocked;

  return { containerRef, ready, failed, scriptBlocked, checking, reset };
}
