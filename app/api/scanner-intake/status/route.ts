import { NextResponse } from "next/server";

import { maskEmailAddress } from "@/lib/scanner-intake";
import {
  getScannerBalance,
  getScannerCheckoutContext,
} from "@/lib/scanner-payments";
import { SCANNER_CREDIT_KEY_COOKIE } from "@/lib/scanner-intake-session";
import {
  deriveScanId,
  getScannerReportStore,
} from "@/lib/scanner-report-store";

type StatusRequest = {
  creditKey?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as StatusRequest;
  const creditKey = payload.creditKey?.trim() || "";

  if (!creditKey) {
    return NextResponse.json(
      {
        eligible: false,
        message:
          "A valid scanner payment key is required before the intake form can be opened.",
      },
      { status: 400 },
    );
  }

  try {
    const store = getScannerReportStore();
    const checkoutContext = await getScannerCheckoutContext(creditKey);
    const scanId = deriveScanId(creditKey);
    const [balance, completed, settled] = await Promise.all([
      getScannerBalance(creditKey),
      store.getByScanId(scanId),
      store.hasSettledSpend(scanId),
    ]);

    if (balance.credits <= 0 && !completed && !settled) {
      return NextResponse.json(
        {
          eligible: false,
          message:
            "This payment key does not have an unspent scanner credit available.",
        },
        { status: 402 },
      );
    }

    const response = NextResponse.json({
      eligible: true,
      credits: balance.credits,
      checkoutEmailHint: maskEmailAddress(checkoutContext.customerEmail),
    });
    response.cookies.set(
      SCANNER_CREDIT_KEY_COOKIE,
      creditKey,
      creditKeyCookieOptions(),
    );
    return response;
  } catch {
    return NextResponse.json(
      {
        eligible: false,
        message: "This scanner payment key could not be verified.",
      },
      { status: 404 },
    );
  }
}

function creditKeyCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/api/scanner-intake",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
