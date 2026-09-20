"use client";

import Link from "next/link";

import { E3dLogoutButton } from "@/components/e3d-logout-button";
import { useE3dSession } from "@/components/e3d-session-context";

export function HeaderAccountStatus() {
  const { session } = useE3dSession();

  // Avoids a flash of "My reports" before the session check resolves --
  // renders nothing for the brief moment it takes to find out.
  if (!session) return null;

  if (session.authenticated) {
    return (
      <div className="oppscan-header__account">
        <Link className="oppscan-header__account-link" href="/account">
          {session.email}
        </Link>
        <E3dLogoutButton />
      </div>
    );
  }

  return (
    <Link className="oppscan-header__account-link" href="/account">
      My reports
    </Link>
  );
}
