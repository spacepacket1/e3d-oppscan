"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { E3dLogoutButton } from "@/components/e3d-logout-button";
import type { E3dSessionUser } from "@/lib/e3d-session";

export function HeaderAccountStatus() {
  const [session, setSession] = useState<E3dSessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/e3d-session")
      .then((response) => response.json())
      .then((data: E3dSessionUser) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => {
        if (!cancelled) setSession({ authenticated: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
