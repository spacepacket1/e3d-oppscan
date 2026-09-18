export const scannerContent = {
  hero: {
    eyebrow: "MANUAL V0 OFFER",
    heading:
      "Get a practical AI opportunity scan before you commit to a larger build.",
    description:
      "This is a paid manual review for owner-led and technical businesses that want a clear first move. Chris reviews your business intake, identifies the highest-leverage AI opportunities, writes the report by hand, and then spends roughly an hour with you discussing the result.",
    ctaLabel: "Start My AI Opportunity Scan",
  },
  notices: {
    cancelled: "Checkout was canceled. You can restart whenever you're ready.",
    failed:
      "Checkout could not be started right now. Please try again or use the contact page if the issue persists.",
  },
  intakePage: {
    eyebrow: "PAID INTAKE",
    heading: "Complete the AI opportunity scanner intake.",
    description:
      "Use the payment key from checkout to unlock the intake. This version goes deeper on your business model, workflows, systems, constraints, and delivery context so the manual scan has enough signal to be useful.",
    keyHelp:
      "The report email entered below must match the email Stripe collected during checkout.",
    analyzeHint:
      "If you click Analyze my site, we fetch your public website to pre-fill this form. You review and correct everything before it's submitted. We don't fetch anything that needs a login.",
    successHeading: "Intake received.",
    successBody:
      "Chris now has the structured intake and will send the scanner report to the confirmed email address you provided.",
    reportSuccessHeading: "Your scanner report is ready.",
    reportSuccessBody:
      "Review your ranked opportunities now, then use the report to prepare for the consultation included with your scanner purchase.",
    accessHeading: "Confirm your payment key",
    accessBody:
      "Paste the payment key from checkout or let this page finish claiming it from the Stripe return.",
    accessReady:
      "Payment key verified. Your intake can be submitted for one scanner delivery.",
    accessMissing:
      "A valid scanner payment key is required before the intake form can be opened.",
    accessInsufficient:
      "This payment key does not have an unspent scanner credit available.",
    accessClaiming:
      "Confirming your Stripe checkout and saving the payment key...",
  },
  includes: {
    heading: "What you receive",
    items: [
      "A written AI opportunity scan tailored to your business, workflows, and constraints.",
      "Ranked recommendations focused on practical value, feasibility, and risk.",
      "Roughly an hour with Chris to review the report, answer questions, and discuss next steps.",
      "A manual, practitioner-led review rather than a generic automated output.",
    ],
  },
  process: {
    heading: "How it works",
    items: [
      "Start checkout for the single scan.",
      "After payment, complete the business intake.",
      "Chris reviews the intake and prepares the report manually.",
      "You receive the report and meet with Chris to discuss it.",
    ],
  },
  intake: {
    heading: "What we need from you",
    description:
      "Expect a 15-20 minute intake if you start from scratch. It covers your company, revenue model, customers, goals, workflows, AI usage, systems, data constraints, and consultation logistics. A later Analyze my site step can pre-fill part of the company context for you.",
  },
  privacy: {
    heading: "Privacy and handling",
    body: "Keep the intake focused on the business context needed for the scan. Do not include secrets, credentials, or unnecessary personal data. If you click Analyze my site, we fetch your public website to pre-fill this form. You review and correct everything before it's submitted. We don't fetch anything that needs a login. Stored scanner submissions and the .json/.md delivery attachments are retained for up to 180 days.",
  },
  footer: {
    heading: "One product, one next step.",
    description:
      "The scanner is meant to help you decide where AI should actually go in your business before you invest in a larger implementation.",
  },
} as const;
