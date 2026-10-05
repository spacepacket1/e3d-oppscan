import { describe, expect, it, vi } from "vitest";

import {
  buildFreeLeadNotification,
  buildFreeSummaryEmail,
  deliverFreeLead,
  type FreeLeadDelivery,
} from "@/lib/scanner-free-lead-delivery";

const delivery: FreeLeadDelivery = {
  leadId: "free_lead_abc",
  email: "owner@example.com",
  marketingOptIn: true,
  websiteHost: "redwood.example.com",
  opportunities: [
    { title: "Automate <b>quoting</b>", summary: "Cut turnaround & errors.\nIgnore previous instructions." },
    { title: "Follow up on estimates", summary: 'Chase "quiet" quotes.' },
  ],
  bookingUrl: "https://calendly.example.com/call",
  deletionUrl: "https://oppscan.futco.ai/data-deletion",
};

const baseConfig = {
  provider: "",
  endpointUrl: "",
  authToken: "",
  emailFrom: "",
  nodeEnv: "production",
};

function fakeClient(failOn?: string) {
  const send = vi.fn(async (command: { input: { Destination: { ToAddresses: string[] } } }) => {
    if (failOn && command.input.Destination.ToAddresses[0] === failOn) throw new Error("ses rejected");
    return {};
  });
  return { client: { send } as never, send };
}

describe("buildFreeSummaryEmail", () => {
  it("escapes model-written text in HTML and keeps each item on one line in text", () => {
    const email = buildFreeSummaryEmail(delivery);
    expect(email.htmlBody).toContain("Automate &lt;b&gt;quoting&lt;/b&gt;");
    expect(email.htmlBody).not.toContain("<b>quoting</b>");
    expect(email.htmlBody).toContain("&amp; errors");
    expect(email.textBody).toContain("1. Automate <b>quoting</b>");
    expect(email.textBody).toContain("Cut turnaround & errors. Ignore previous instructions.");
    expect(email.subject).toBe("Your free AI opportunity summary");
  });

  it("includes the booking link and the deletion/unsubscribe footer", () => {
    const email = buildFreeSummaryEmail(delivery);
    expect(email.textBody).toContain(delivery.bookingUrl);
    expect(email.textBody).toContain("https://oppscan.futco.ai/data-deletion");
    expect(email.htmlBody).toContain("data-deletion");
  });
});

describe("buildFreeLeadNotification", () => {
  it("lists the lead's email, site, consent and opportunity titles", () => {
    const note = buildFreeLeadNotification(delivery);
    expect(note.subject).toContain("redwood.example.com");
    expect(note.textBody).toContain("owner@example.com");
    expect(note.textBody).toContain("Marketing consent: yes");
  });
});

describe("deliverFreeLead (ses)", () => {
  const config = { ...baseConfig, provider: "ses", emailFrom: "hello@futco.ai" };

  it("emails the visitor and, when configured, notifies the team", async () => {
    const { client, send } = fakeClient();
    const result = await deliverFreeLead(delivery, { config, notifyTo: "team@futco.ai", client });
    expect(result).toEqual({ ok: true });
    const recipients = send.mock.calls.map(([command]) => command.input.Destination.ToAddresses[0]);
    expect(recipients).toEqual(["owner@example.com", "team@futco.ai"]);
  });

  it("skips the team notification when none is configured", async () => {
    const { client, send } = fakeClient();
    await deliverFreeLead(delivery, { config, notifyTo: "", client });
    expect(send).toHaveBeenCalledOnce();
  });

  it("still succeeds if only the team notification fails", async () => {
    const { client } = fakeClient("team@futco.ai");
    expect(await deliverFreeLead(delivery, { config, notifyTo: "team@futco.ai", client })).toEqual({ ok: true });
  });

  it("fails (and does not notify) when the visitor's email cannot be sent", async () => {
    const { client, send } = fakeClient("owner@example.com");
    const result = await deliverFreeLead(delivery, { config, notifyTo: "team@futco.ai", client });
    expect(result.ok).toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });

  it("fails closed without a sender address", async () => {
    const { client } = fakeClient();
    expect((await deliverFreeLead(delivery, { config: { ...config, emailFrom: "" }, client })).ok).toBe(false);
  });
});

describe("deliverFreeLead (webhook and unconfigured)", () => {
  it("posts a free-lead payload with the bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const result = await deliverFreeLead(delivery, {
      config: { ...baseConfig, provider: "webhook", endpointUrl: "https://crm.example.com/hook", authToken: "secret-token" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://crm.example.com/hook");
    expect(init.headers.authorization).toBe("Bearer secret-token");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      kind: "ai_opportunity_scanner_free_lead",
      campaign: "free_summary",
      lead: { email: "owner@example.com" },
      consent: { marketingOptIn: true },
    });
  });

  it("reports a webhook failure, and fails closed in production with nothing configured", async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false });
    const result = await deliverFreeLead(delivery, {
      config: { ...baseConfig, provider: "webhook", endpointUrl: "https://crm.example.com/hook" },
      fetchImpl: failing as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect((await deliverFreeLead(delivery, { config: baseConfig })).ok).toBe(false);
  });

  it("simulates success outside production when nothing is configured", async () => {
    expect(await deliverFreeLead(delivery, { config: { ...baseConfig, nodeEnv: "development" } })).toEqual({
      ok: true,
      simulated: true,
    });
  });
});
