export const siteIdentity = {
  name: "Oppscan",
  legalOperator: "FutCo LLC",
  footerTagline: "An initiative of FutCo LLC",
} as const;

export const primaryCta = {
  label: "Book an Intro Call",
  // No standalone contact page here yet; fall back to the parent site's.
  fallbackHref: "https://applied.futco.ai/contact",
} as const;

export const contactDetails = {
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "help@futco.ai",
} as const;

export function resolvePrimaryCtaHref() {
  return process.env.NEXT_PUBLIC_BOOKING_URL || primaryCta.fallbackHref;
}
