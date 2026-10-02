"use client";

import { useEffect } from "react";

import {
  FUTCO_META_PIXEL_ID,
  ensureMetaPixel,
  trackMetaPixelEvent,
} from "@/lib/meta-pixel";

// Fires Purchase once per Stripe session when the customer lands back on
// /intake after paying. The URL there carries ?stripe_session_id=..., which
// the pixel would otherwise report to Meta, so the query string is removed
// for the instant the event is sent and then restored.
export function ScannerPurchasePixel({
  stripeSessionId,
  value,
  currency,
}: {
  stripeSessionId: string;
  value: number;
  currency: string;
}) {
  useEffect(() => {
    if (!stripeSessionId) return;

    const storageKey = `meta-purchase:${stripeSessionId}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // sessionStorage unavailable: fall through and send once per mount.
    }

    ensureMetaPixel(FUTCO_META_PIXEL_ID);

    // Until fbevents.js finishes loading, fbq only queues calls and reads the
    // page URL later, so wait for callMethod before stripping the query.
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (!window.fbq?.callMethod) {
        if (attempts > 100) window.clearInterval(timer);
        return;
      }
      window.clearInterval(timer);

      const original = window.location.pathname + window.location.search + window.location.hash;
      window.history.replaceState(window.history.state, "", window.location.pathname);
      try {
        trackMetaPixelEvent("PageView");
        trackMetaPixelEvent("Purchase", { params: { value, currency } });
      } finally {
        window.history.replaceState(window.history.state, "", original);
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [stripeSessionId, value, currency]);

  return null;
}
