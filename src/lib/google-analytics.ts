// Minimal GA4 (gtag.js) loader, browser-only, mirroring meta-pixel.ts: builds
// the official snippet's shim programmatically instead of an inline <script>.
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Oppscan GA4 measurement ID (the oppscan.futco.ai data stream).
export const FUTCO_GA_MEASUREMENT_ID = "G-CQJSKQ5PW8";

let configuredId: string | null = null;

export function ensureGoogleAnalytics(measurementId: string) {
  if (typeof window === "undefined" || !measurementId) return;
  if (configuredId === measurementId) return;
  configuredId = measurementId;

  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    // gtag.js requires the `arguments` object itself, not an array of it.
    window.gtag = function gtag() {
      window.dataLayer?.push(arguments);
    };
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  window.gtag("js", new Date());
  // Page views are sent manually per route so the URL allow-list is enforced.
  window.gtag("config", measurementId, { send_page_view: false });
}

export function trackGoogleAnalyticsPageView(measurementId: string) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_location: window.location.href,
    page_path: window.location.pathname,
    page_title: document.title,
    send_to: measurementId,
  });
}
