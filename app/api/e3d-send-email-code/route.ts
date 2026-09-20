import { NextResponse } from "next/server";

// Matches e3d.ai's own flow: called right after a successful /signup to
// email the 6-digit verification code.
const E3D_API_BASE = process.env.E3D_API_BASE_URL?.trim() || "https://e3d.ai/api";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json(
      { success: false, message: "Email is required." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${E3D_API_BASE}/sendEmailCode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: email }),
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
