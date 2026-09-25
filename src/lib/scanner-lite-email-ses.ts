import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

// Used only while the HighLevel webhook isn't wired up yet (see
// scanner-lite-delivery.ts's "ses" provider branch) -- sends the report
// email directly via AWS SES rather than handing delivery to a CRM.
// Credentials and region come from the SDK's standard default provider
// chain (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION), not a
// bespoke env var set, so ops/run/run-oppscan.sh's existing
// ".env.production.local" sourcing picks them up for free.
export type SesReportEmailResult =
  | { ok: true }
  | { ok: false; message: string };

let cachedClient: SESv2Client | undefined;

function getClient() {
  cachedClient ??= new SESv2Client({});
  return cachedClient;
}

export async function sendHvacLiteReportEmailViaSes(
  {
    fromAddress,
    toAddress,
    companyName,
    reportUrl,
    bookingUrl,
  }: {
    fromAddress: string;
    toAddress: string;
    companyName: string;
    reportUrl: string;
    bookingUrl: string;
  },
  client: SESv2Client = getClient(),
): Promise<SesReportEmailResult> {
  const subject = `Your free AI opportunity report for ${companyName}`;
  const textBody = [
    "Hi,",
    "",
    `Your free AI opportunity report is ready: ${reportUrl}`,
    "",
    "Want to talk it through? Book a complimentary 30-minute AI Opportunity & Strategy Review:",
    bookingUrl,
    "",
    "- The Team @ itera.works",
  ].join("\n");
  const htmlBody =
    `<p>Hi,</p>` +
    `<p>Your free AI opportunity report is ready: <a href="${reportUrl}">${reportUrl}</a></p>` +
    `<p>Want to talk it through? Book a complimentary 30-minute AI Opportunity &amp; Strategy Review: ` +
    `<a href="${bookingUrl}">${bookingUrl}</a></p>` +
    `<p>- The Team @ itera.works</p>`;

  try {
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: fromAddress,
        Destination: { ToAddresses: [toAddress] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: textBody, Charset: "UTF-8" },
              Html: { Data: htmlBody, Charset: "UTF-8" },
            },
          },
        },
      }),
    );
    return { ok: true };
  } catch (error) {
    // SES rejects an unverified sender/recipient (sandbox mode) or a
    // missing/invalid credential with a descriptive message -- surfaced
    // as-is server-side (console) but never to the visitor, same as every
    // other delivery failure path.
    console.error("HVAC Lite SES send failed:", error);
    return { ok: false, message: "Scanner lite delivery failed. Please try again." };
  }
}
