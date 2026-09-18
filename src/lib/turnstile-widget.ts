// The Cloudflare Turnstile script (loaded via next/script) attaches this
// global. It's untyped by default since the script is loaded from a CDN,
// not imported as a module.
type TurnstileRenderOptions = {
  sitekey: string;
  appearance?: "always" | "execute" | "interaction-only";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
};

type TurnstileGlobal = {
  render: (
    container: string | HTMLElement,
    options: TurnstileRenderOptions,
  ) => string;
  reset: (container?: string | HTMLElement) => void;
  remove: (container?: string | HTMLElement) => void;
};

function getTurnstileGlobal() {
  return (window as unknown as { turnstile?: TurnstileGlobal }).turnstile;
}

export function resetTurnstileWidget(containerId: string) {
  const turnstile = getTurnstileGlobal();
  if (!turnstile) return;
  try {
    turnstile.reset(containerId);
  } catch {
    // Widget may not be mounted yet (e.g. script still loading) -- the
    // stale token it would have reset is harmless since a fresh submit
    // will simply fail the same way and prompt a reload.
  }
}

// Cloudflare's implicit `class="cf-turnstile"` auto-render scans the DOM
// exactly once, when its script finishes loading -- it does not watch for
// elements added afterward. A container that only mounts later (e.g. behind
// a gated step like "confirm your payment key") is never picked up: no
// widget instance is ever created, so there's no checkbox and no callback
// ever fires, even though the script itself loaded fine. Explicit
// rendering, triggered by our own mount whenever the container actually
// appears, works regardless of that ordering.
//
// `container` must already be attached to the document (call this from a
// ref callback, not a plain useEffect keyed on a value, so it fires exactly
// when the node exists). Returns a cleanup function that unmounts the
// widget; call it when the container itself unmounts.
export function mountTurnstileWidget(
  container: HTMLElement,
  options: TurnstileRenderOptions,
  onScriptBlocked: () => void,
  { pollIntervalMs = 150, timeoutMs = 8000 } = {},
) {
  let cancelled = false;
  let widgetId: string | undefined;
  const deadline = Date.now() + timeoutMs;

  function attempt() {
    if (cancelled) return;
    const turnstile = getTurnstileGlobal();
    if (turnstile) {
      widgetId = turnstile.render(container, options);
      return;
    }
    if (Date.now() >= deadline) {
      onScriptBlocked();
      return;
    }
    window.setTimeout(attempt, pollIntervalMs);
  }
  attempt();

  return () => {
    cancelled = true;
    if (widgetId === undefined) return;
    const turnstile = getTurnstileGlobal();
    try {
      turnstile?.remove(widgetId);
    } catch {
      // Container may already be gone (e.g. page navigation) -- nothing to
      // clean up in that case.
    }
  };
}
