"use client";

import type { ReactNode } from "react";

import { trackMetaPixelEvent } from "@/lib/meta-pixel";

// Wraps the homepage's server-action checkout form so the click can fire
// InitiateCheckout before the redirect to Stripe.
export function ScannerCheckoutForm({
  action,
  children,
  value,
  currency,
}: {
  action: () => Promise<void>;
  children: ReactNode;
  value: number;
  currency: string;
}) {
  return (
    <form
      action={action}
      onSubmit={() =>
        trackMetaPixelEvent("InitiateCheckout", {
          params: { value, currency },
        })
      }
    >
      {children}
    </form>
  );
}
