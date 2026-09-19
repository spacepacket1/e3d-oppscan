"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function E3dLogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    try {
      await fetch("/api/e3d-logout", { method: "POST" });
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
