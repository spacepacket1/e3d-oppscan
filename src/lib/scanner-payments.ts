import { getSiteUrl } from "@/lib/seo";

const DEFAULT_E3D_API_BASE_URL = "https://e3d.ai/api";
const SCANNER_PRODUCT_ID = "scanner";
const SCANNER_PACK_ID = "single";
export const SCANNER_INTAKE_ROUTE = "/scanner/intake";

type FetchLike = typeof fetch;

type ProductPack = {
  id: string;
  name: string;
  description: string;
  credits: number;
  amountUsdCents: number;
  currency: string;
};

type ProductDefinition = {
  product: string;
  displayName: string;
  stripePacks?: ProductPack[];
};

type ProductsResponse = {
  products?: ProductDefinition[];
};

type StripeCheckoutResponse = {
  url?: string;
  sessionId?: string;
  error?: string;
  code?: string;
};

type BalanceResponse = {
  product?: string;
  credits?: number;
  error?: string;
  code?: string;
};

type CheckoutContextResponse = {
  product?: string;
  customerEmail?: string;
  stripeSessionId?: string;
  error?: string;
  code?: string;
};

type SpendResponse = {
  status?: string;
  creditsSpent?: number;
  creditsRemaining?: number;
  requestId?: string;
  error?: string;
  code?: string;
};

type ClaimResponse = {
  status?: string;
  creditKey?: string | null;
  issuedCredits?: number;
  error?: string;
  code?: string;
};

export type ScannerOffer = {
  product: string;
  displayName: string;
  pack: ProductPack;
  formattedPrice: string;
};

export type ScannerBalance = {
  product: string;
  credits: number;
};

export type ScannerCheckoutContext = {
  product: string;
  customerEmail: string;
  stripeSessionId: string;
};

export type ScannerCreditSpend = {
  status: string;
  creditsSpent: number;
  creditsRemaining: number;
  requestId: string;
};

export type ScannerSessionClaim =
  | { status: "completed"; creditKey: string; issuedCredits: number }
  | { status: "pending" | "not_found" | "failed" | "already_claimed"; message: string };

export function getE3dApiBaseUrl() {
  const configured = process.env.E3D_API_BASE_URL?.trim() || DEFAULT_E3D_API_BASE_URL;

  try {
    const url = new URL(configured);
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_E3D_API_BASE_URL;
  }
}

export async function getScannerOffer(fetchImpl: FetchLike = fetch): Promise<ScannerOffer> {
  const response = await fetchImpl(`${getE3dApiBaseUrl()}/payments/products`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Scanner product lookup failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ProductsResponse;
  const product = payload.products?.find((entry) => entry.product === SCANNER_PRODUCT_ID);

  if (!product) {
    throw new Error("Scanner product is not available from the payments API.");
  }

  const pack = product.stripePacks?.find((entry) => entry.id === SCANNER_PACK_ID);

  if (!pack) {
    throw new Error("Scanner Stripe pack is missing from the payments API.");
  }

  return {
    product: product.product,
    displayName: product.displayName,
    pack,
    formattedPrice: formatUsdCents(pack.amountUsdCents, pack.currency),
  };
}

export async function createScannerCheckoutSession(
  fetchImpl: FetchLike = fetch,
): Promise<{ url: string; sessionId: string }> {
  // This app is a separate host from the scanner's original home
  // (applied.futco.ai), which is still the shared payments API's default
  // success/cancel destination for the "scanner" product. Override both so
  // Stripe returns the customer here instead. The API validates the host
  // against its own allowlist, independent of this override.
  const siteUrl = getSiteUrl();
  const successUrl = new URL(
    "/intake?stripe_session_id={CHECKOUT_SESSION_ID}",
    siteUrl,
  ).toString();
  const cancelUrl = new URL("/?stripe_cancelled=1", siteUrl).toString();

  const response = await fetchImpl(`${getE3dApiBaseUrl()}/payments/stripe/checkout`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      product: SCANNER_PRODUCT_ID,
      packId: SCANNER_PACK_ID,
      successUrl,
      cancelUrl,
    }),
  });

  const payload = (await response.json()) as StripeCheckoutResponse;

  if (!response.ok || !payload.url || !payload.sessionId) {
    throw new Error(payload.error || payload.code || "Scanner checkout could not be started.");
  }

  return {
    url: payload.url,
    sessionId: payload.sessionId,
  };
}

export async function getScannerBalance(
  creditKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<ScannerBalance> {
  const response = await fetchImpl(
    `${getE3dApiBaseUrl()}/payments/credits/balance?product=${SCANNER_PRODUCT_ID}`,
    {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${creditKey}`,
      },
    },
  );

  const payload = (await response.json()) as BalanceResponse;

  if (!response.ok || payload.credits == null || !payload.product) {
    throw new Error(payload.error || payload.code || "Scanner balance lookup failed.");
  }

  return {
    product: payload.product,
    credits: payload.credits,
  };
}

export async function getScannerCheckoutContext(
  creditKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<ScannerCheckoutContext> {
  const response = await fetchImpl(
    `${getE3dApiBaseUrl()}/payments/credits/checkout-context?product=${SCANNER_PRODUCT_ID}`,
    {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${creditKey}`,
      },
    },
  );

  const payload = (await response.json()) as CheckoutContextResponse;

  if (!response.ok || !payload.product || !payload.customerEmail) {
    throw new Error(payload.error || payload.code || "Scanner checkout context lookup failed.");
  }

  return {
    product: payload.product,
    customerEmail: payload.customerEmail,
    stripeSessionId: payload.stripeSessionId || "",
  };
}

export async function spendScannerIntakeCredit(
  {
    creditKey,
    requestId,
    metadata,
  }: {
    creditKey: string;
    requestId: string;
    metadata: Record<string, unknown>;
  },
  fetchImpl: FetchLike = fetch,
): Promise<ScannerCreditSpend> {
  const internalServiceKey = process.env.E3D_SCANNER_INTERNAL_SERVICE_KEY?.trim() || "";

  if (!internalServiceKey) {
    throw new Error("Scanner payment spend is not configured on this server.");
  }

  const response = await fetchImpl(`${getE3dApiBaseUrl()}/payments/credits/spend`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      authorization: `Internal ${internalServiceKey}`,
    },
    body: JSON.stringify({
      product: SCANNER_PRODUCT_ID,
      creditKey,
      route: SCANNER_INTAKE_ROUTE,
      requestId,
      metadata,
    }),
  });

  const payload = (await response.json()) as SpendResponse;

  if (
    !response.ok ||
    !payload.status ||
    payload.creditsSpent == null ||
    payload.creditsRemaining == null ||
    !payload.requestId
  ) {
    throw new Error(payload.error || payload.code || "Scanner credit spend failed.");
  }

  return {
    status: payload.status,
    creditsSpent: payload.creditsSpent,
    creditsRemaining: payload.creditsRemaining,
    requestId: payload.requestId,
  };
}

export async function claimScannerSessionCreditKey(
  sessionId: string,
  fetchImpl: FetchLike = fetch,
): Promise<ScannerSessionClaim> {
  const response = await fetchImpl(
    `${getE3dApiBaseUrl()}/payments/stripe/session/${encodeURIComponent(sessionId)}/result`,
    {
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as ClaimResponse;

  if (response.ok && payload.status === "completed" && payload.creditKey) {
    return {
      status: "completed",
      creditKey: payload.creditKey,
      issuedCredits: Number(payload.issuedCredits || 0),
    };
  }

  if (response.status === 202) {
    return { status: "pending", message: "Payment confirmation is still processing." };
  }

  if (response.status === 404) {
    return { status: "not_found", message: "Stripe checkout session was not found." };
  }

  if (response.status === 409) {
    return {
      status: "already_claimed",
      message: payload.error || "This payment key has already been claimed.",
    };
  }

  if (response.status === 402) {
    return {
      status: "failed",
      message: payload.error || "Payment confirmation failed.",
    };
  }

  throw new Error(payload.error || payload.code || "Stripe session claim failed.");
}

function formatUsdCents(amountUsdCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountUsdCents / 100);
}
