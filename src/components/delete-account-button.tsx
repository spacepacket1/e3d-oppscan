"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useE3dSession } from "@/components/e3d-session-context";

export function DeleteAccountButton({ email }: { email: string }) {
  const router = useRouter();
  const { setSession } = useE3dSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  function openDialog() {
    setConfirmText("");
    setError("");
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmText.trim().toLowerCase() !== email.trim().toLowerCase()) {
      setError("Type your email exactly to confirm.");
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const response = await fetch("/api/e3d-delete-account", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };
      if (!response.ok || !payload.success) {
        setError(payload.message || "Could not delete your account. Please try again.");
        return;
      }
      setSession({ authenticated: false });
      closeDialog();
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not delete your account. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button className="button button--danger" onClick={openDialog} type="button">
        Delete account
      </button>
      {/* Outside any other <form>: see e3d-login-form.tsx for why a
          <dialog>'s own <form> can never be nested inside another one. */}
      <dialog className="e3d-auth-dialog" ref={dialogRef}>
        <form className="contact-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
          <h2>Delete your account</h2>
          <p>
            This permanently deletes your e3d.ai account ({email}) — shared across every e3d.ai
            product, not just this one — and cannot be undone.
          </p>
          <div className="form-field">
            <label htmlFor="delete-account-confirm">
              <span>Type your email to confirm</span>
            </label>
            <input
              autoComplete="off"
              id="delete-account-confirm"
              onChange={(event) => setConfirmText(event.currentTarget.value)}
              required
              type="text"
              value={confirmText}
            />
          </div>
          {error ? (
            <p className="form-error form-error--summary" role="alert">
              {error}
            </p>
          ) : null}
          <div className="e3d-auth-dialog__actions">
            <button className="button button--ghost" onClick={closeDialog} type="button">
              Cancel
            </button>
            <button className="button button--danger" disabled={isPending} type="submit">
              {isPending ? "Deleting..." : "Delete my account"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
