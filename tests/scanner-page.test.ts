import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn(() => new Headers()));
const e3dSessionMocks = vi.hoisted(() => ({ getE3dSessionUser: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));
vi.mock("@/lib/e3d-session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/e3d-session")>(
    "@/lib/e3d-session",
  );
  return { ...actual, ...e3dSessionMocks };
});

import ScannerPage, {
  generateMetadata as generateScannerMetadata,
} from "../app/page";
import { scannerContent } from "@/content/scanner-content";
import {
  createScannerCheckoutSession,
  getE3dApiBaseUrl,
  getScannerOffer,
} from "@/lib/scanner-payments";
import { getCanonicalUrl } from "@/lib/seo";

describe("Phase 3 scanner landing page", () => {
  beforeEach(() => {
    e3dSessionMocks.getE3dSessionUser.mockResolvedValue({ authenticated: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    headersMock.mockReset().mockReturnValue(new Headers());
    e3dSessionMocks.getE3dSessionUser.mockReset();
  });

  it("renders the scanner page with the live-fetched price instead of a hardcoded duplicate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            products: [
              {
                product: "scanner",
                displayName: "AI Opportunity Scanner",
                stripePacks: [
                  {
                    id: "single",
                    name: "AI Opportunity Scan",
                    description: "1 AI opportunity scan report + consultation",
                    credits: 500,
                    amountUsdCents: 12345,
                    currency: "usd",
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const page = await ScannerPage({ searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("$123.45");
    expect(markup).not.toContain("$99.00");
    expect(markup).toContain(scannerContent.hero.heading);
    expect(markup).toContain(scannerContent.hero.ctaLabel);
    expect(markup).toContain("spends roughly an hour with you discussing the result");
    expect(markup).toContain("Expect a 15-20 minute intake if you start from scratch.");
    expect(markup).toContain("Analyze my site");
    expect(markup).toContain("retained for up to 180 days");
  });

  it("shows checkout notices from query params", async () => {
    const productsPayload = {
      products: [
        {
          product: "scanner",
          displayName: "AI Opportunity Scanner",
          stripePacks: [
            {
              id: "single",
              name: "AI Opportunity Scan",
              description: "1 AI opportunity scan report + consultation",
              credits: 500,
              amountUsdCents: 9900,
              currency: "usd",
            },
          ],
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify(productsPayload), {
            status: 200,
          }),
      ),
    );

    const canceledPage = await ScannerPage({
      searchParams: Promise.resolve({ stripe_cancelled: "1" }),
    });
    const canceledMarkup = renderToStaticMarkup(canceledPage);
    expect(canceledMarkup).toContain("Checkout was canceled.");

    const errorPage = await ScannerPage({
      searchParams: Promise.resolve({ checkout_error: "1" }),
    });
    const errorMarkup = renderToStaticMarkup(errorPage);
    expect(errorMarkup).toContain("Checkout could not be started right now.");
  });

  it("loads scanner offer and checkout from the configured payments API", async () => {
    vi.stubEnv("E3D_API_BASE_URL", "https://payments.example.com/api");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            products: [
              {
                product: "scanner",
                displayName: "AI Opportunity Scanner",
                stripePacks: [
                  {
                    id: "single",
                    name: "AI Opportunity Scan",
                    description: "1 AI opportunity scan report + consultation",
                    credits: 500,
                    amountUsdCents: 9900,
                    currency: "usd",
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://checkout.stripe.com/c/pay/test",
            sessionId: "cs_test_123",
          }),
          { status: 201 },
        ),
      );

    const offer = await getScannerOffer(fetchMock);
    const checkout = await createScannerCheckoutSession(fetchMock);

    expect(getE3dApiBaseUrl()).toBe("https://payments.example.com/api");
    expect(offer.formattedPrice).toBe("$99.00");
    expect(checkout).toEqual({
      url: "https://checkout.stripe.com/c/pay/test",
      sessionId: "cs_test_123",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://payments.example.com/api/payments/products",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://payments.example.com/api/payments/stripe/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          product: "scanner",
          packId: "single",
          successUrl:
            "https://oppscan.e3d.ai/intake?stripe_session_id={CHECKOUT_SESSION_ID}",
          cancelUrl: "https://oppscan.e3d.ai/?stripe_cancelled=1",
        }),
      }),
    );
  });

  it("sends a signed-in admin straight to the intake form instead of Stripe checkout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            products: [
              {
                product: "scanner",
                displayName: "AI Opportunity Scanner",
                stripePacks: [
                  {
                    id: "single",
                    name: "AI Opportunity Scan",
                    description: "1 AI opportunity scan report + consultation",
                    credits: 500,
                    amountUsdCents: 9900,
                    currency: "usd",
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    e3dSessionMocks.getE3dSessionUser.mockResolvedValue({
      authenticated: true,
      email: "admin@futco.ai",
      roles: ["admin"],
    });

    const page = await ScannerPage({ searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Free (admin)");
    expect(markup).toContain('href="/intake"');
    expect(markup).not.toContain("$99.00");
  });

  it("publishes canonical metadata for the scanner route", () => {
    const metadata = generateScannerMetadata();

    expect(metadata.title).toBe("Oppscan | AI Opportunity Scanner");
    expect(metadata.alternates?.canonical).toBe(getCanonicalUrl("/"));
    expect(metadata.description).toContain("manual AI opportunity scan");
  });
});
