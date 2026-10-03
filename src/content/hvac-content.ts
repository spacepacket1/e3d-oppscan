import { contactDetails } from "@/content/site-config";

export const hvacLiteContent = {
  brand: {
    productName: "HVAC Business AI Opportunity Scanner",
    company: "FutCo",
    footerTagline: "A product of FutCo LLC",
    contactEmail: contactDetails.email,
    homeHref: "https://futco.ai",
  },
  meta: {
    title: "HVAC Business AI Opportunity Scanner | FutCo",
    description:
      "See where faster response and follow-up could mean more booked work for your HVAC business. Get a free custom report in minutes.",
  },
  // Per Chapple's spec (2026-09-26 + 2026-09-29 emails, discussed 2026-09-30):
  // automation/AI is how FutCo gets the result, never the thing being
  // sold. This copy -- both the landing page and the report -- leads with
  // booked work, response speed, and customer experience, and mentions
  // automation only as the mechanism.
  valueProposition:
    "FutCo helps local service companies capture more of the demand they already generate by improving response, estimate follow-up, customer communication, and administrative workflows using the systems they already have.",
  report: {
    // Static replacement for the old on-screen AI Base/Potential Score
    // panel -- Chapple was explicit that unexplained numbers like "400"
    // don't help an executive reader. The real ranking still happens
    // behind the scenes (see rankScannerCandidates).
    opportunitiesIntroHeading: "Potential opportunities identified",
    opportunitiesIntroItems: [
      "Capture more of the demand you already generate",
      "Improve response and booking speed",
      "Recover more unsold replacement estimates",
      "Reduce administrative work",
      "Create a more consistent customer experience",
    ],
    ctaLabel: "Validate the Opportunity in 20 Minutes",
    ctaSupportingText:
      "Bring your approximate monthly inquiry volume, missed-call count, unsold estimate count, and average job value. We'll determine whether one of these opportunities is financially meaningful enough to justify a focused pilot.",
    ctaHelperText:
      "This opens Calendly to schedule your complimentary 20-minute call with FutCo.",
    implementationHeading: "How FutCo can help you implement this",
    implementationBody: [
      "The 20-minute validation call is where this becomes a plan: which opportunity is worth piloting first, what a 30-day pilot looks like, and what FutCo sets up directly versus what your team owns.",
      "From there, FutCo can support implementation in whatever way fits your business, whether that's a single automation, a broader package, or ongoing support as you work through the roadmap.",
    ],
  },
  hero: {
    eyebrow: "FREE FOR HVAC OPERATORS",
    heading: "Capture More Booked Work From the Calls You're Already Getting",
    description:
      "See where faster response, better estimate follow-up, and more consistent customer communication could mean more booked jobs for your business. Enter your website and work email below — we'll review your public site and send you a free custom report, plus an invite to a quick call to validate the opportunity.",
  },
  form: {
    heading: "Get your free opportunity report",
    websiteLabel: "Business website",
    emailLabel: "Work email",
    submitLabel: "Get my free report",
    pendingLabel: "Reviewing your site...",
    emailNotice: "We'll use this email only to deliver your report.",
    toolsSummary: "Which software do you use today? (optional)",
    toolsHelp:
      "Optional. Tick whatever you use for scheduling and dispatch and we'll tailor the report to it.",
    consentLabel:
      "Send me occasional ideas and future communications from FutCo about improving my business with simple AI solutions. I can unsubscribe at any time.",
  },
  success: {
    heading: "Thanks — we're on it.",
    body: "We're reviewing your website now. Your free report will be emailed to you shortly, along with an invite to a quick 20-minute call to validate the opportunity.",
  },
} as const;
