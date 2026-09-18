// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, findByLabelText, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ScannerIntakeForm } from "@/components/scanner-intake-form";
import { emptyScannerIntakeFormValues, type ScannerIntakeFormState } from "@/lib/scanner-intake";

// jsdom in this project isn't started with a localStorage backend; provide one.
if (typeof window.localStorage?.getItem !== "function") {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

// Stub fetch so the auto-claim / status effects don't hit the network.
vi.stubGlobal(
  "fetch",
  vi.fn(async () =>
    new Response(JSON.stringify({ status: "not_found", message: "n/a" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
  ),
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const idleState: ScannerIntakeFormState = {
  status: "idle",
  values: emptyScannerIntakeFormValues,
  errors: {},
};

function renderReadyForm() {
  return render(
    createElement(ScannerIntakeForm, {
      action: async () => idleState,
      initialState: idleState,
      initialVerifiedAccess: {
        creditKey: "e3d_scanner_pay_test",
        checkoutEmailHint: "b***r@example.com",
        credits: 500,
      },
    }),
  );
}

describe("scanner intake form interaction", () => {
  it("mounts the unlocked form without throwing", () => {
    expect(() => renderReadyForm()).not.toThrow();
  });

  it("accepts typing into a text field", () => {
    renderReadyForm();
    const companyName = screen.getByLabelText(/company name/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(companyName, { target: { value: "FutCo" } });
    });
    expect(companyName.value).toBe("FutCo");
  });

  it("accepts typing into a textarea field", () => {
    renderReadyForm();
    const description = screen.getByLabelText(/what does your company do/i) as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(description, { target: { value: "We build things." } });
    });
    expect(description.value).toBe("We build things.");
  });

  it("real flow: claims via stripe session, then accepts typing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/scanner-intake/claim")) {
          return new Response(
            JSON.stringify({
              status: "completed",
              creditKey: "e3d_scanner_pay_live",
              checkoutEmailHint: "b***r@example.com",
              credits: 1,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ ok: false, reason: "n/a" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const { container } = render(
      createElement(ScannerIntakeForm, {
        action: async () => idleState,
        initialState: idleState,
        stripeSessionId: "cs_live_test123",
        turnstileSiteKey: "1x00000000000000000000AA",
      }),
    );

    const companyName = (await findByLabelText(container as HTMLElement, /company name/i, {}, {
      timeout: 3000,
    })) as HTMLInputElement;

    act(() => {
      fireEvent.change(companyName, { target: { value: "FutCo" } });
    });
    expect(companyName.value).toBe("FutCo");

    await waitFor(() => {
      expect(screen.queryByText(/this page couldn't load/i)).toBeNull();
    });
  });
});
