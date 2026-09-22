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

  const payload = (await upstream.json().catch(() => ({}))) as { message?: string };

  // spacepacket's /signup can't tell "someone else already has this email"
  // apart from "this is your own half-finished signup" -- both just get
  // "Email already in use". Disambiguate by trying to log in with the
  // same credentials: if that comes back 403 needsVerification, the email
  // and password match an existing-but-unverified account, i.e. this really
  // is the same person picking their signup back up, so let them continue
  // to the verify step instead of dead-ending on an error. A wrong
  // password (401) or an already-verified match (200) both mean this
  // isn't a resumable signup, so the original error stands.
  if (upstream.status === 400 && payload.message === "Email already in use") {
    let loginUpstream: Response;
    try {
      loginUpstream = await fetch(`${E3D_API_BASE}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return NextResponse.json(payload, { status: upstream.status });
    }
    if (loginUpstream.status === 403) {
      const loginPayload = (await loginUpstream.json().catch(() => ({}))) as {
        needsVerification?: boolean;
      };
      if (loginPayload.needsVerification) {
        return NextResponse.json({ success: false, needsVerification: true });
      }
    }
  }

  return NextResponse.json(payload, { status: upstream.status });
}
