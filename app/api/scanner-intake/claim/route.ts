import { NextResponse } from "next/server";

import { formatScannerCheckoutEmailHint } from "@/lib/scanner-intake";
import {
  claimScannerSessionCreditKey,
  getScannerBalance,
  getScannerCheckoutContext,
} from "@/lib/scanner-payments";
import { SCANNER_CREDIT_KEY_COOKIE } from "@/lib/scanner-intake-session";

type ClaimRequest = {
  sessionId?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as ClaimRequest;
  const sessionId = payload.sessionId?.trim() || "";

  if (!sessionId) {
    return NextResponse.json(
      { status: "not_found", message: "Stripe checkout session is missing." },
      { status: 400 },
    );
  }

  try {
    const claim = await claimScannerSessionCreditKey(sessionId);

    if (claim.status !== "completed") {
      return NextResponse.json(claim, {
        status:
          claim.status === "pending"
            ? 202
            : claim.status === "already_claimed"
              ? 409
              : claim.status === "failed"
                ? 402
                : 404,
      });
    }

    const [balance, checkoutContext] = await Promise.all([
      getScannerBalance(claim.creditKey),
      getScannerCheckoutContext(claim.creditKey),
    ]);

    const response = NextResponse.json({
      status: "completed",
      creditKey: claim.creditKey,
      credits: balance.credits,
      checkoutEmailHint: formatScannerCheckoutEmailHint(checkoutContext.customerEmail),
    });
    response.cookies.set(SCANNER_CREDIT_KEY_COOKIE, claim.creditKey, creditKeyCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      {
        status: "failed",
        message: "Stripe checkout could not be confirmed right now.",
      },
      { status: 500 },
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
