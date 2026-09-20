import { NextResponse } from "next/server";

import { getE3dSessionUser } from "@/lib/e3d-session";

// Read-only reflection of the visitor's own shared e3d.ai session (never
// anyone else's) -- safe to expose client-side. Kept separate from the
// root layout so the auth check happens client-side after the page has
// already streamed, instead of forcing every page under the layout to
// opt out of static generation just to show a header login/logout state.
export async function GET(request: Request) {
  const session = await getE3dSessionUser(request.headers.get("cookie") || "");
  return NextResponse.json(session);
}
