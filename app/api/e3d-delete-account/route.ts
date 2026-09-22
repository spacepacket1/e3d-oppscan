import { NextResponse } from "next/server";

// Server-to-server call to spacepacket's own /deleteUser. That endpoint is
// session-authenticated and only ever deletes req.user's own account (see
// spacepacket.js) -- there is no email/id in the request body, so a caller
// can't name someone else's account.
const E3D_API_BASE = process.env.E3D_API_BASE_URL?.trim() || "https://e3d.ai/api";

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  let upstream: Response;
  try {
    upstream = await fetch(`${E3D_API_BASE}/deleteUser`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({}),
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Could not reach the account service. Please try again." },
      { status: 502 },
    );
  }

  const payload = await upstream.json().catch(() => ({}));
  const response = NextResponse.json(payload, { status: upstream.status });
  for (const setCookie of upstream.headers.getSetCookie()) {
    response.headers.append("set-cookie", setCookie);
  }
  if (upstream.ok) {
    // spacepacket's own clearCookie on this route (unlike the one on
    // /logout, which we already fixed) doesn't set Domain=.e3d.ai, so the
    // browser treats it as clearing an unrelated cookie and leaves the
    // real shared-domain session in place. Force-clear it here rather than
    // touching spacepacket again for the same class of bug.
    response.headers.append(
      "set-cookie",
      "connect.sid=; Path=/; Domain=.e3d.ai; Max-Age=0; HttpOnly; Secure; SameSite=None",
    );
  }
  return response;
}
