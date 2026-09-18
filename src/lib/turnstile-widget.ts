// The Cloudflare Turnstile script (loaded via next/script) attaches this
// global. It's untyped by default since the script is loaded from a CDN,
// not imported as a module.
type TurnstileGlobal = {
  reset: (container?: string | HTMLElement) => void;
};

export function resetTurnstileWidget(containerId: string) {
  const turnstile = (window as unknown as { turnstile?: TurnstileGlobal })
    .turnstile;
  if (!turnstile) return;
  try {
    turnstile.reset(containerId);
  } catch {
    // Widget may not be mounted yet (e.g. script still loading) -- the
    // stale token it would have reset is harmless since a fresh submit
    // will simply fail the same way and prompt a reload.
  }
}

// Implicit-render Turnstile widgets invoke a global function named by the
// data-callback/data-error-callback/data-expired-callback attributes. Ad
// blockers, privacy extensions, and strict tracking protection can prevent
// the widget from ever producing a token at all, which otherwise surfaces
// only as a vague "please try again" after a full failed form submission --
// this lets the form show a specific, actionable message the moment the
// widget itself fails, without waiting for a round trip to the server.
export function registerTurnstileCallback(callbackName: string, handler: () => void) {
  const w = window as unknown as Record<string, unknown>;
  w[callbackName] = handler;
  return () => {
    delete w[callbackName];
  };
}

// If challenges.cloudflare.com/turnstile/v0/api.js is blocked (ad blocker,
// privacy extension, corporate network, DNS filtering), the widget's own
// error/expired callbacks never fire -- the script that would call them
// never runs. This is the only way to distinguish "script never loaded" (no
// visible widget, ever) from "widget loaded but the challenge itself
// failed" (which the error/expired callbacks already cover).
export function watchForBlockedTurnstileScript(
  onBlocked: () => void,
  timeoutMs = 6000,
) {
  const timer = window.setTimeout(() => {
    const turnstile = (window as unknown as { turnstile?: TurnstileGlobal })
      .turnstile;
    if (!turnstile) onBlocked();
  }, timeoutMs);
  return () => window.clearTimeout(timer);
}
