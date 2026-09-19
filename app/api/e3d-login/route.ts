import { NextResponse } from "next/server";

// Server-to-server call to spacepacket's own /login, not a browser CORS
// request -- avoids needing oppscan.e3d.ai added to spacepacket's CORS
// allowlist. The upstream Set-Cookie (Domain=.e3d.ai) is valid coming from
// this response too, since oppscan.e3d.ai is itself a *.e3d.ai host, so
// relaying it verbatim is enough for the browser to accept and store it.
const E3D_LOGIN_URL =
  (process.env.E3D_API_BASE_URL?.trim() || "https://e3d.ai/api") + "/login";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { message: "Email and password are required." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(E3D_LOGIN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return NextResponse.json(
      { message: "Could not reach the sign-in service. Please try again." },
      { status: 502 },
    );
  }

  const payload = await upstream.json().catch(() => ({}));
  const response = NextResponse.json(payload, { status: upstream.status });
  for (const cookie of upstream.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
