"use client";

import { useState } from "react";

export function DeleteReportButton({
  scanId,
  redirectTo,
  action,
}: {
  scanId: string;
  redirectTo?: string;
  action: (scanId: string, redirectTo?: string) => Promise<void>;
}) {
  const [isPending, setIsPending] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        "Permanently delete this report? This cannot be undone -- unlike Revoke, there is no way to restore it.",
      )
    ) {
      return;
    }
    setIsPending(true);
    try {
      await action(scanId, redirectTo);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      className="button button--ghost"
      disabled={isPending}
      onClick={() => void handleDelete()}
      type="button"
    >
      {isPending ? "Deleting..." : "Delete"}
    </button>
  );
}
