"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useE3dSession } from "@/components/e3d-session-context";
import { E3dSignupDialog } from "@/components/e3d-signup-dialog";

type LoginResponse = {
  message?: string;
  needsVerification?: boolean;
};

export function E3dLoginForm() {
  const router = useRouter();
  const { refresh } = useE3dSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError("");
    try {
      const response = await fetch("/api/e3d-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as LoginResponse;
      if (!response.ok) {
        setError(payload.message || "Sign-in failed. Please try again.");
        return;
      }
      // Same reasoning as logout: router.refresh() alone won't update the
      // header's already-mounted session state, so re-fetch it directly.
      await refresh();
      router.refresh();
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <form className="contact-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-field">
          <label htmlFor="e3d-login-email">
            <span>Email</span>
          </label>
          <input
            autoComplete="email"
            id="e3d-login-email"
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <div className="form-field">
          <label htmlFor="e3d-login-password">
            <span>Password</span>
          </label>
          <input
            autoComplete="current-password"
            id="e3d-login-password"
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            type="password"
            value={password}
          />
        </div>
        {error ? (
          <p className="form-error form-error--summary" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button button--primary" disabled={isPending} type="submit">
          {isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>
      {/* Outside the login <form>: a <dialog>'s own <form> nested inside
          another <form> is invalid HTML -- the parser drops the inner
          form tag entirely, so its submit button has no form to submit
          and silently does nothing. */}
      <div className="development-note">
        No account? <E3dSignupDialog />
      </div>
    </>
  );
}
