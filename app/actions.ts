"use server";

import { redirect } from "next/navigation";

import { createScannerCheckoutSession } from "@/lib/scanner-payments";

export async function startScannerCheckout() {
  let destination: string;

  try {
    const checkout = await createScannerCheckoutSession();
    destination = checkout.url;
  } catch (error) {
    console.error("startScannerCheckout: failed to create checkout session", error);
    destination = "/?checkout_error=1";
  }

  // redirect() throws internally, so it must run outside the try/catch above —
  // otherwise the catch swallows the redirect signal and every attempt lands
  // on the error page, even a successful one.
  redirect(destination);
}
