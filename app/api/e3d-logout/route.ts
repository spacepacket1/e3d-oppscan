import { NextResponse } from "next/server";

// Same server-to-server pattern as /api/e3d-login: forwards the visitor's
// own session cookie to spacepacket's /logout so it destroys the right
// session server-side, then relays the resulting Set-Cookie (which clears
// the shared Domain=.e3d.ai cookie) back verbatim.
const E3D_LOGOUT_URL =
  (process.env.E3D_API_BASE_URL?.trim() || "https://e3d.ai/api") + "/logout";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";

  let upstream: Response;
  try {
    upstream = await fetch(E3D_LOGOUT_URL, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      redirect: "manual",
    });
  } catch {
    return NextResponse.json(
      { message: "Could not reach the sign-out service. Please try again." },
      { status: 502 },
    );
  }

  const response = NextResponse.json({ ok: true });
  for (const cookie of upstream.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
