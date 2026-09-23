// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FreeScannerForm } from "@/components/free-scanner-form";
import { emptyFreeScannerIntakeValues, type FreeScannerFormState } from "@/lib/scanner-free-intake";

vi.stubGlobal(
  "fetch",
  vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, draft: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ),
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const idleState: FreeScannerFormState = {
  status: "idle",
  values: emptyFreeScannerIntakeValues,
  errors: {},
};

function renderForm() {
  return render(
    createElement(FreeScannerForm, {
      action: async () => idleState,
      initialState: idleState,
    }),
  );
}

describe("free scanner form interaction", () => {
  it("mounts without throwing", () => {
    expect(() => renderForm()).not.toThrow();
  });

  // Regression test: the website field's onChange used to read
  // event.currentTarget.value lazily inside the setValues updater function.
  // Native DOM events null out currentTarget once dispatch finishes, and
  // React doesn't always invoke a functional state updater synchronously
  // within that dispatch -- so the second (and every subsequent) keystroke
  // threw "Cannot read properties of null (reading 'value')" and crashed
  // the whole form. The paid intake form (scanner-intake-form.tsx) already
  // captures the value into a local const before calling setValues; this
  // mirrors that fix.
  it("accepts multiple consecutive keystrokes into the website field without throwing", () => {
    renderForm();
    const website = screen.getByLabelText(/company website/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(website, { target: { value: "h" } });
    });
    expect(() => {
      act(() => {
        fireEvent.change(website, { target: { value: "ht" } });
      });
    }).not.toThrow();
    act(() => {
      fireEvent.change(website, { target: { value: "https://example.com" } });
    });
    expect(website.value).toBe("https://example.com");
  });

  it("accepts typing into a text field after the website field", () => {
    renderForm();
    const companyName = screen.getByLabelText(/company name/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(companyName, { target: { value: "F" } });
    });
    act(() => {
      fireEvent.change(companyName, { target: { value: "FutCo" } });
    });
    expect(companyName.value).toBe("FutCo");
  });

  it("accepts typing into a textarea field", () => {
    renderForm();
    const description = screen.getByLabelText(/what does your company do/i) as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(description, { target: { value: "W" } });
    });
    act(() => {
      fireEvent.change(description, { target: { value: "We build things." } });
    });
    expect(description.value).toBe("We build things.");
  });
});
