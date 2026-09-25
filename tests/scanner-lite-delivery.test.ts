import { afterEach, describe, expect, it, vi } from "vitest";

const sesMocks = vi.hoisted(() => ({
  sendHvacLiteReportEmailViaSes: vi.fn(),
}));

vi.mock("@/lib/scanner-lite-email-ses", () => sesMocks);

import { deliverScannerLiteSubmission } from "@/lib/scanner-lite-delivery";

const basePayload = {
  requestId: "hvac-lite:scan_lite_abc",
  companyWebsite: "https://redwoodhvac.example.com",
  companyName: "Redwood HVAC",
  workEmail: "owner@redwoodhvac.example.com",
  marketingOptIn: true,
  reportUrl: "https://oppscan.e3d.ai/report/token123",
  campaign: "hvac_lite",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("deliverScannerLiteSubmission", () => {
  it("simulates success outside production when nothing is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await deliverScannerLiteSubmission(basePayload, {
      provider: "",
      endpointUrl: "",
      authToken: "",
      emailFrom: "",
      nodeEnv: "development",
    });

    expect(result).toEqual({ ok: true, simulated: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed in production when nothing is configured", async () => {
    const result = await deliverScannerLiteSubmission(basePayload, {
      provider: "",
      endpointUrl: "",
      authToken: "",
      emailFrom: "",
      nodeEnv: "production",
    });

    expect(result).toEqual({
      ok: false,
      message: "Scanner lite delivery is not configured.",
    });
  });

  it("rejects an unsupported provider", async () => {
    const result = await deliverScannerLiteSubmission(basePayload, {
      provider: "zapier",
      endpointUrl: "https://example.com/hook",
      authToken: "",
      emailFrom: "",
      nodeEnv: "production",
    });

    expect(result.ok).toBe(false);
  });

  it("posts the lead, report link, and consent flag to the configured webhook", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await deliverScannerLiteSubmission(basePayload, {
      provider: "webhook",
      endpointUrl: "https://highlevel.example.com/hook",
      authToken: "secret-token",
      emailFrom: "",
      nodeEnv: "production",
    });

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://highlevel.example.com/hook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer secret-token",
        }),
      }),
    );

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      kind: "ai_opportunity_scanner_lite_lead",
      campaign: "hvac_lite",
      company: { name: "Redwood HVAC", website: "https://redwoodhvac.example.com" },
      lead: { email: "owner@redwoodhvac.example.com" },
      consent: { marketingOptIn: true },
      report: { url: "https://oppscan.e3d.ai/report/token123" },
    });
  });

  it("returns a controlled error when the webhook rejects the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await deliverScannerLiteSubmission(basePayload, {
      provider: "webhook",
      endpointUrl: "https://highlevel.example.com/hook",
      authToken: "",
      emailFrom: "",
      nodeEnv: "production",
    });

    expect(result.ok).toBe(false);
  });

  it("returns a controlled error when the fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await deliverScannerLiteSubmission(basePayload, {
      provider: "webhook",
      endpointUrl: "https://highlevel.example.com/hook",
      authToken: "",
      emailFrom: "",
      nodeEnv: "production",
    });

    expect(result.ok).toBe(false);
  });

  it("sends via SES when configured with the ses provider", async () => {
    sesMocks.sendHvacLiteReportEmailViaSes.mockResolvedValue({ ok: true });

    const result = await deliverScannerLiteSubmission(basePayload, {
      provider: "ses",
      endpointUrl: "",
      authToken: "",
      emailFrom: "hvac-test@futco.ai",
      nodeEnv: "production",
    });

    expect(result).toEqual({ ok: true });
    expect(sesMocks.sendHvacLiteReportEmailViaSes).toHaveBeenCalledWith({
      fromAddress: "hvac-test@futco.ai",
      toAddress: "owner@redwoodhvac.example.com",
      companyName: "Redwood HVAC",
      reportUrl: "https://oppscan.e3d.ai/report/token123",
      bookingUrl: "https://calendly.com/itera-support/oppscan-ai-strategy-call",
    });
  });

  it("fails closed for ses when no sender address is configured", async () => {
    const result = await deliverScannerLiteSubmission(basePayload, {
      provider: "ses",
      endpointUrl: "",
      authToken: "",
      emailFrom: "",
      nodeEnv: "production",
    });

    expect(result.ok).toBe(false);
    expect(sesMocks.sendHvacLiteReportEmailViaSes).not.toHaveBeenCalled();
  });
});
