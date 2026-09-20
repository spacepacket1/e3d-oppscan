"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useE3dSession } from "@/components/e3d-session-context";

export function E3dLogoutButton() {
  const router = useRouter();
  const { setSession } = useE3dSession();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    try {
      await fetch("/api/e3d-logout", { method: "POST" });
      // Updates every consumer of the shared session (the header) right
      // away -- router.refresh() alone only re-runs Server Components, it
      // doesn't re-trigger an already-mounted Client Component's effects.
      setSession({ authenticated: false });
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      className="button button--ghost"
      disabled={isPending}
      onClick={() => void handleLogout()}
      type="button"
    >
      {isPending ? "Signing out..." : "Log out"}
    </button>
  );
}
