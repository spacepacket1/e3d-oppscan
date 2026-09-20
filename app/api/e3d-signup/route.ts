import { NextResponse } from "next/server";

// Server-to-server, matching e3d.ai's own signup dialog (SignupDialog.js):
// POST /signup with { email, password, subscribeNewsletter }. No session
// cookie involved yet -- the account doesn't exist until this succeeds,
// and isn't usable until the email is verified.
const E3D_API_BASE = process.env.E3D_API_BASE_URL?.trim() || "https://e3d.ai/api";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { success: false, message: "Email and password are required." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${E3D_API_BASE}/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, subscribeNewsletter: false }),
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Could not reach the signup service. Please try again." },
      { status: 502 },
    );
  }

  const payload = await upstream.json().catch(() => ({}));
  return NextResponse.json(payload, { status: upstream.status });
}
