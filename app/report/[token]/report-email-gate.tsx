"use client";

import { useActionState } from "react";

import type { ReportEmailGateState } from "./actions";

export function ReportEmailGate({
  action,
}: {
  action: (
    previousState: ReportEmailGateState,
    formData: FormData,
  ) => Promise<ReportEmailGateState>;
}) {
  const [state, formAction, isPending] = useActionState(action, {
    status: "idle",
  });

  return (
    <main className="page-main">
      <section className="page-section">
        <div className="container">
          <div className="content-panel">
            <h1>Confirm your email to view this report</h1>
            <p>
              For your privacy, this report is only shown after confirming
              the email address used at checkout.
            </p>
            <form action={formAction} className="contact-form" noValidate>
              <div className="form-field">
                <label htmlFor="email">
                  <span>Email used at checkout</span>
                </label>
                <input
                  autoComplete="email"
                  id="email"
                  name="email"
                  required
                  type="email"
                />
              </div>
              {state.status === "error" ? (
                <p className="form-error form-error--summary" role="alert">
                  {state.message}
                </p>
              ) : null}
              <button
                className="button button--primary"
                disabled={isPending}
                type="submit"
              >
                {isPending ? "Checking..." : "View report"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
