import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FreeLeadCapture } from "@/components/free-lead-capture";

describe("FreeLeadCapture", () => {
  const markup = renderToStaticMarkup(
    createElement(FreeLeadCapture, {
      action: vi.fn(),
      summaryToken: "signed.token",
      turnstileSiteKey: "site-key",
    }),
  );

  it("asks only for an email, with consent unchecked by default", () => {
    expect(markup).toContain("Want this summary in your inbox?");
    expect(markup).toContain('name="email"');
    expect(markup).toContain('type="email"');
    expect(markup).toContain('name="marketingOptIn"');
    expect(markup).not.toMatch(/name="marketingOptIn"[^>]*checked/);
  });

  it("never locks the button behind the invisible bot check", () => {
    expect(markup).toContain("Email me this summary");
    expect(markup).not.toContain("Getting ready...");
    expect(markup).not.toMatch(/<button[^>]*disabled/);
  });

  it("shows the normal button when no bot check is configured", () => {
    const withoutCheck = renderToStaticMarkup(
      createElement(FreeLeadCapture, { action: vi.fn(), summaryToken: "signed.token" }),
    );
    expect(withoutCheck).toContain("Email me this summary");
    expect(withoutCheck).not.toContain("Getting ready...");
    expect(withoutCheck).not.toMatch(/<button[^>]*disabled/);
  });

  it("carries the signed summary token and a hidden honeypot", () => {
    expect(markup).toContain('name="summaryToken"');
    expect(markup).toContain('value="signed.token"');
    expect(markup).toContain('name="website"');
    expect(markup).toContain("contact-form__honeypot");
  });
});
