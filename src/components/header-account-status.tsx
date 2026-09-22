"use client";

import Link from "next/link";

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
          My reports
        </Link>
        <Link
          aria-label={`Account settings (${session.email})`}
          className="oppscan-header__profile-link"
          href="/account/profile"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="22"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            viewBox="0 0 24 24"
            width="22"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" />
          </svg>
        </Link>
      </div>
    );
  }

  return (
    <Link className="oppscan-header__account-link" href="/account">
      My reports
    </Link>
  );
}
