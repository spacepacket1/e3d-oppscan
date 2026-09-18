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
