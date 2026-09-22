"use client";

import { useRef, useState, type FormEvent } from "react";

import { useE3dSession } from "@/components/e3d-session-context";

type Step = "signup" | "verify";

export function E3dSignupDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { refresh } = useE3dSession();
  const [step, setStep] = useState<Step>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  function openDialog() {
    setStep("signup");
    setError("");
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSignupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setIsPending(true);
    try {
      const response = await fetch("/api/e3d-signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        needsVerification?: boolean;
        message?: string;
      };
      if (!payload.success && !payload.needsVerification) {
        setError(payload.message || "Could not create your account. Please try again.");
        return;
      }
      // Best-effort -- the account already exists either way, and most
      // failures here are transient email-delivery hiccups. "Resend code"
      // on the next step covers a genuinely failed send.
      await fetch("/api/e3d-send-email-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      }).catch(() => {});
      setStep("verify");
    } catch {
      setError("Could not create your account. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPending(true);
    try {
      const response = await fetch("/api/e3d-verify-email-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const payload = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) {
        setError(payload.message || "That code didn't work. Please try again.");
        return;
      }
      // Matches e3d.ai's own post-verification behavior: log the new
      // account in immediately instead of making them re-enter credentials.
      await fetch("/api/e3d-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      }).catch(() => {});
      await refresh();
      closeDialog();
    } catch {
      setError("That code didn't work. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleResendCode() {
    setError("");
    try {
      const response = await fetch("/api/e3d-send-email-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) {
        setError(payload.message || "Could not resend the code. Please try again.");
      }
    } catch {
      setError("Could not resend the code. Please try again.");
    }
  }

  return (
    <>
      <button className="button button--secondary" onClick={openDialog} type="button">
        Create a free account
      </button>
      <dialog className="e3d-auth-dialog" ref={dialogRef}>
        {step === "signup" ? (
          <form
            className="contact-form"
            noValidate
            onSubmit={(event) => void handleSignupSubmit(event)}
          >
            <h2>Create your free account</h2>
            <div className="form-field">
              <label htmlFor="signup-email">
                <span>Email</span>
              </label>
              <input
                autoComplete="email"
                id="signup-email"
                onChange={(event) => setEmail(event.currentTarget.value)}
                required
                type="email"
                value={email}
              />
            </div>
            <div className="form-field">
              <label htmlFor="signup-password">
                <span>Password</span>
              </label>
              <input
                autoComplete="new-password"
                id="signup-password"
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
                type="password"
                value={password}
              />
            </div>
            <div className="form-field">
              <label htmlFor="signup-confirm-password">
                <span>Confirm password</span>
              </label>
              <input
                autoComplete="new-password"
                id="signup-confirm-password"
                onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                required
                type="password"
                value={confirmPassword}
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
              <button className="button button--primary" disabled={isPending} type="submit">
                {isPending ? "Creating..." : "Create account"}
              </button>
            </div>
          </form>
        ) : (
          <form
            className="contact-form"
            noValidate
            onSubmit={(event) => void handleVerifySubmit(event)}
          >
            <h2>Check your email</h2>
            <p>We sent a 6-digit verification code to {email}.</p>
            <div className="form-field">
              <label htmlFor="verify-code">
                <span>Verification code</span>
              </label>
              <input
                autoComplete="one-time-code"
                id="verify-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setCode(event.currentTarget.value)}
                required
                value={code}
              />
            </div>
            {error ? (
              <p className="form-error form-error--summary" role="alert">
                {error}
              </p>
            ) : null}
            <div className="e3d-auth-dialog__actions">
              <button
                className="button button--ghost"
                onClick={() => void handleResendCode()}
                type="button"
              >
                Resend code
              </button>
              <button className="button button--primary" disabled={isPending} type="submit">
                {isPending ? "Verifying..." : "Verify"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
