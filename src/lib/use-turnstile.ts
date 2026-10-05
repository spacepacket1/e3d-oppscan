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
// errors, the script is blocked, or it is simply slow (see READY_FALLBACK_MS),
// the button is enabled anyway and the server rejects a missing token with the
// usual message.
const READY_FALLBACK_MS = 8000;

export function useTurnstile(widgetId: string, siteKey: string) {
  const [ready, setReady] = useState(!siteKey);
  const [failed, setFailed] = useState(false);
  const [scriptBlocked, setScriptBlocked] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Explicit rendering, triggered by a ref callback that fires exactly when the
  // container is attached (see turnstile-widget.ts for why).
  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (!node || !siteKey) return;
      setFailed(false);
      setScriptBlocked(false);
      cleanupRef.current = mountTurnstileWidget(
        node,
        {
          sitekey: siteKey,
          appearance: "interaction-only",
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

  useEffect(() => {
    if (!siteKey || ready) return;
    const timer = window.setTimeout(() => setReady(true), READY_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [siteKey, ready]);

  const reset = useCallback(() => resetTurnstileWidget(widgetId), [widgetId]);

  // True only while the invisible check is still running and nothing has gone
  // wrong; this is when a form should hold its submit button.
  const checking = Boolean(siteKey) && !ready && !failed && !scriptBlocked;

  return { containerRef, ready, failed, scriptBlocked, checking, reset };
}
