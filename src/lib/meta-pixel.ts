// Minimal Meta Pixel loader/tracker, browser-only (like turnstile-widget.ts,
// this has no "use client" directive of its own -- it's only ever imported
// from files that already are one). Avoids adding the official snippet's
// inline <script> (which next/script would otherwise need `dangerouslySet...`
// for) by building the same shim programmatically instead.
type FbqQueueArgs = unknown[];

type FbqFunction = {
  (...args: FbqQueueArgs): void;
  callMethod?: (...args: FbqQueueArgs) => void;
  queue: FbqQueueArgs[];
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
  }
}

const initializedPixelIds = new Set<string>();

export function ensureMetaPixel(pixelId: string) {
  if (typeof window === "undefined" || !pixelId) return;

  if (!window.fbq) {
    const fbq: FbqFunction = ((...args: FbqQueueArgs) => {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
      } else {
        fbq.queue.push(args);
      }
    }) as FbqFunction;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    window._fbq = fbq;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }

  if (!initializedPixelIds.has(pixelId)) {
    initializedPixelIds.add(pixelId);
    window.fbq?.("init", pixelId);
  }
}

export function trackMetaPixelEvent(
  event: string,
  { custom = false }: { custom?: boolean } = {},
) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq(custom ? "trackCustom" : "track", event);
}
