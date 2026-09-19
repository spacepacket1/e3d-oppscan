// Reads the visitor's shared e3d.ai session (set with Domain=.e3d.ai by
// spacepacket's login) by forwarding it, server-to-server, to spacepacket's
// own /auth/status. This is a Node-to-Node call, never a browser XHR, so it
// deliberately doesn't touch spacepacket's CORS allowlist -- only the
// browser-shared cookie itself needs to reach this app.
export type E3dSessionUser =
  | { authenticated: false }
  | { authenticated: true; email: string; roles: string[] };

const ADMIN_ROLE = "admin";

export async function getE3dSessionUser(
  cookieHeader: string,
): Promise<E3dSessionUser> {
  if (!cookieHeader.trim()) return { authenticated: false };

  const baseUrl = process.env.E3D_API_BASE_URL?.trim() || "https://e3d.ai/api";
  try {
    const response = await fetch(`${baseUrl}/auth/status`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!response.ok) return { authenticated: false };
    const payload = (await response.json()) as {
      authenticated?: boolean;
      user?: { email?: string; roles?: unknown };
    };
    const email = payload.user?.email?.trim();
    if (!payload.authenticated || !email) return { authenticated: false };
    return {
      authenticated: true,
      email,
      roles: Array.isArray(payload.user?.roles)
        ? payload.user.roles.filter((role): role is string => typeof role === "string")
        : [],
    };
  } catch {
    return { authenticated: false };
  }
}

export function isE3dAdmin(session: E3dSessionUser) {
  return session.authenticated && session.roles.includes(ADMIN_ROLE);
}
