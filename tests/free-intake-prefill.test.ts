import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
const rateLimitMocks = vi.hoisted(() => ({
  isFreePrefillRateLimited: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/lib/scanner-free-rate-limit", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/scanner-free-rate-limit")
  >("@/lib/scanner-free-rate-limit");
  return { ...actual, ...rateLimitMocks };
});

import { POST as postFreePrefill } from "../app/api/free-intake/prefill/route";

function stubHeaders(ip: string) {
  headersMock.mockResolvedValue(new Headers({ "x-forwarded-for": ip }));
}

describe("free intake prefill route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    headersMock.mockReset();
    rateLimitMocks.isFreePrefillRateLimited.mockReset();
  });

  it("rejects before calling upstream when rate-limited", async () => {
    stubHeaders("9.9.9.9");
    rateLimitMocks.isFreePrefillRateLimited.mockReturnValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postFreePrefill(
      new Request("https://oppscan.e3d.ai/api/free-intake/prefill", {
        method: "POST",
        body: JSON.stringify({ website: "https://acme.example" }),
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false, reason: "rate_limited" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a hashed IP and Internal auth to the free upstream endpoint, no credit key", async () => {
    stubHeaders("203.0.113.5");
    rateLimitMocks.isFreePrefillRateLimited.mockReturnValue(false);
    vi.stubEnv("E3D_API_BASE_URL", "https://payments.example.com/api");
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "scanner-internal");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          draft: { companyName: "Acme", industry: "Logistics", ignored: "nope" },
          model: "gpt-5-mini",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await postFreePrefill(
      new Request("https://oppscan.e3d.ai/api/free-intake/prefill", {
        method: "POST",
        body: JSON.stringify({ website: "https://acme.example" }),
      }),
    );
    const payload = await response.json();

    const expectedIpHash = createHash("sha256").update("203.0.113.5").digest("hex");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://payments.example.com/api/payments/scanner/intake-prefill-free",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Internal scanner-internal",
          "content-type": "application/json",
        }),
        body: JSON.stringify({ website: "https://acme.example", ipHash: expectedIpHash }),
      }),
    );
    expect(payload).toEqual({
      ok: true,
      draft: { companyName: "Acme", industry: "Logistics" },
      model: "gpt-5-mini",
    });
    expect(JSON.stringify(payload)).not.toContain("scanner-internal");
    expect(JSON.stringify(payload)).not.toContain("203.0.113.5");
  });

  it("maps network failures to a safe error response", async () => {
    stubHeaders("203.0.113.5");
    rateLimitMocks.isFreePrefillRateLimited.mockReturnValue(false);
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "scanner-internal");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    const response = await postFreePrefill(
      new Request("https://oppscan.e3d.ai/api/free-intake/prefill", {
        method: "POST",
        body: JSON.stringify({ website: "https://acme.example" }),
      }),
    );

    expect(await response.json()).toEqual({ ok: false, reason: "network_error" });
  });

  it("requires a website", async () => {
    stubHeaders("203.0.113.5");
    rateLimitMocks.isFreePrefillRateLimited.mockReturnValue(false);

    const response = await postFreePrefill(
      new Request("https://oppscan.e3d.ai/api/free-intake/prefill", {
        method: "POST",
        body: JSON.stringify({ website: "" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, reason: "missing_website" });
  });
});
