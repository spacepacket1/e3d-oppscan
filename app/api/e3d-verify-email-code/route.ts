import { NextResponse } from "next/server";

// Matches e3d.ai's own VerifyEmailCodeDialog: POST /verifyEmailCode with
// { username, code } (spacepacket accepts either username or email in
// that field -- our signup sets both to the same email).
const E3D_API_BASE = process.env.E3D_API_BASE_URL?.trim() || "https://e3d.ai/api";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    code?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!email || !code) {
    return NextResponse.json(
      { success: false, message: "Email and verification code are required." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${E3D_API_BASE}/verifyEmailCode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: email, code }),
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
