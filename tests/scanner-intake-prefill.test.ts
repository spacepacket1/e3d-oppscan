import { afterEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.hoisted(() => vi.fn());
const headersMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
  headers: headersMock,
}));

import { POST as postPrefill } from "../app/api/scanner-intake/prefill/route";
import {
  clearScannerIntakeDraft,
  computeEditedScannerIntakeFields,
  mergeScannerIntakeDraft,
} from "@/lib/scanner-intake-prefill";
import { emptyScannerIntakeFormValues } from "@/lib/scanner-intake";

function stubNoSessionHeaders() {
  headersMock.mockResolvedValue(new Headers());
}

describe("scanner intake prefill", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    cookiesMock.mockReset();
    headersMock.mockReset();
  });

  it("sends the verified credit key and Internal auth server-side without returning the key", async () => {
    vi.stubEnv("E3D_API_BASE_URL", "https://payments.example.com/api");
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "scanner-internal");
    stubNoSessionHeaders();
    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "e3d_scanner_pay_cookie" }),
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          draft: {
            companyName: "FutCo",
            companyWebsite: "https://futco.ai",
            ignored: "nope",
          },
          sources: [{ url: "https://futco.ai", chars: 321 }],
          model: "gpt-5-mini",
          truncated: false,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await postPrefill(
      new Request("https://oppscan.e3d.ai/api/scanner-intake/prefill", {
        method: "POST",
        body: JSON.stringify({ website: "https://futco.ai" }),
      }),
    );
    const payload = await response.json();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://payments.example.com/api/payments/scanner/intake-prefill",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Internal scanner-internal",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          creditKey: "e3d_scanner_pay_cookie",
          website: "https://futco.ai",
        }),
      }),
    );
    expect(payload).toEqual({
      ok: true,
      draft: {
        companyName: "FutCo",
        companyWebsite: "https://futco.ai",
      },
      sources: [{ url: "https://futco.ai", chars: 321 }],
      model: "gpt-5-mini",
      truncated: false,
    });
    expect(payload).not.toHaveProperty("creditKey");
    expect(JSON.stringify(payload)).not.toContain("scanner-internal");
  });

  it("fills only blank fields and never overwrites what the person already typed", () => {
    const merged = mergeScannerIntakeDraft(
      {
        ...emptyScannerIntakeFormValues,
        companyWebsite: "https://original.example",
      },
      {
        companyName: " FutCo ",
        companyWebsite: "futco.ai",
        industry: "Consulting",
      },
    );

    expect(merged.values.companyName).toBe("FutCo");
    // companyWebsite was already entered — left as-is, not counted as drafted.
    expect(merged.values.companyWebsite).toBe("https://original.example");
    expect(merged.values.industry).toBe("Consulting");
    expect(merged.draftedFields).toEqual(["companyName", "industry"]);
  });

  it("keeps edited drafted fields and clears untouched drafted values", () => {
    const base = mergeScannerIntakeDraft(emptyScannerIntakeFormValues, {
      companyName: "FutCo",
      industry: "Consulting",
    });

    expect(
      computeEditedScannerIntakeFields(
        {
          ...base.values,
          companyName: "FutCo Labs",
        },
        {
          companyName: "FutCo",
          industry: "Consulting",
        },
        base.draftedFields,
      ),
    ).toEqual(["companyName"]);

    expect(
      clearScannerIntakeDraft(
        {
          ...base.values,
          companyName: "FutCo Labs",
        },
        {
          companyName: "FutCo",
          industry: "Consulting",
        },
        base.draftedFields,
      ),
    ).toEqual({
      ...emptyScannerIntakeFormValues,
      companyName: "FutCo Labs",
    });
  });

  it("maps network failures to a safe error response", async () => {
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "scanner-internal");
    stubNoSessionHeaders();
    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "e3d_scanner_pay_cookie" }),
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    const response = await postPrefill(
      new Request("https://oppscan.e3d.ai/api/scanner-intake/prefill", {
        method: "POST",
        body: JSON.stringify({ website: "https://futco.ai" }),
      }),
    );

    expect(await response.json()).toEqual({ ok: false, reason: "network_error" });
  });

  // Regression test: page.tsx grants an admin visiting /intake directly a
  // fake `admin-bypass:...` credit key as a UI convenience, but the
  // upstream payments service has never heard of that key and always
  // rejects it with NO_BALANCE -- admin prefill silently never worked.
  // The route must independently re-verify admin status server-side (never
  // trust the credit key cookie's shape) and route those calls to the same
  // credit-free endpoint the free tier uses instead.
  it("bypasses the credit-gated endpoint for a verified admin session", async () => {
    vi.stubEnv("E3D_API_BASE_URL", "https://payments.example.com/api");
    vi.stubEnv("E3D_SCANNER_INTERNAL_SERVICE_KEY", "scanner-internal");
    headersMock.mockResolvedValue(
      new Headers({ cookie: "e3d_session=abc", "x-forwarded-for": "1.2.3.4" }),
    );
    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "admin-bypass:deadbeef" }),
    });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/auth/status")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ authenticated: true, user: { email: "admin@futco.ai", roles: ["admin"] } }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            draft: { companyName: "FutCo", industry: "Consulting" },
            model: "gpt-5-mini",
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await postPrefill(
      new Request("https://oppscan.e3d.ai/api/scanner-intake/prefill", {
        method: "POST",
        body: JSON.stringify({ website: "https://futco.ai" }),
      }),
    );
    const payload = await response.json();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://payments.example.com/api/payments/scanner/intake-prefill-free",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"website":"https://futco.ai"'),
      }),
    );
    // Never sends the fake admin-bypass credit key upstream.
    const freeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("intake-prefill-free"),
    );
    expect(String(freeCall?.[1]?.body)).not.toContain("admin-bypass");
    expect(payload.ok).toBe(true);
    expect(payload.draft).toMatchObject({ companyName: "FutCo", industry: "Consulting" });
  });
});
