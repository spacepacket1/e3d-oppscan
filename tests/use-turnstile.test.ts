// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTurnstile } from "@/lib/use-turnstile";

type RenderOptions = {
  sitekey: string;
  appearance?: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
};

let captured: RenderOptions | undefined;
const resetSpy = vi.fn();
const removeSpy = vi.fn();

function installTurnstile() {
  (window as unknown as { turnstile: unknown }).turnstile = {
    render: (_container: unknown, options: RenderOptions) => {
      captured = options;
      return "widget-1";
    },
    reset: resetSpy,
    remove: removeSpy,
  };
}

beforeEach(() => {
  captured = undefined;
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as unknown as { turnstile?: unknown }).turnstile;
  vi.clearAllMocks();
});

function mount(siteKey: string) {
  const hook = renderHook(() => useTurnstile("test-widget", siteKey));
  act(() => {
    hook.result.current.containerRef(document.createElement("div"));
  });
  return hook;
}

// A form shaped like the real ones: Turnstile drops its token into a hidden
// input inside the form.
function makeForm() {
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "cf-turnstile-response";
  form.appendChild(input);
  const requestSubmit = vi.fn();
  form.requestSubmit = requestSubmit;
  return { form, input, requestSubmit };
}

function submitEvent(form: HTMLFormElement) {
  const preventDefault = vi.fn();
  return {
    event: { currentTarget: form, preventDefault } as unknown as FormEvent<HTMLFormElement>,
    preventDefault,
  };
}

describe("useTurnstile", () => {
  it("lets submits straight through when no site key is configured", () => {
    const { result } = renderHook(() => useTurnstile("test-widget", ""));
    const { form } = makeForm();
    const { event, preventDefault } = submitEvent(form);
    expect(result.current.ready).toBe(true);
    expect(result.current.guardSubmit(event)).toBe(true);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("renders in interaction-only mode and reports ready once the token arrives", () => {
    installTurnstile();
    const { result } = mount("site-key");
    expect(captured?.appearance).toBe("interaction-only");
    expect(captured?.sitekey).toBe("site-key");
    expect(result.current.ready).toBe(false);

    act(() => captured?.callback?.("token"));
    expect(result.current.ready).toBe(true);
  });

  it("never locks the button while the check runs", () => {
    installTurnstile();
    const { result } = mount("site-key");
    expect(result.current.verifying).toBe(false);
  });

  it("submits immediately when the token is already in the form", () => {
    installTurnstile();
    const { result } = mount("site-key");
    const { form, input } = makeForm();
    input.value = "token";
    const { event, preventDefault } = submitEvent(form);
    expect(result.current.guardSubmit(event)).toBe(true);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("holds a tap that arrives before the token, then submits the form once it lands", async () => {
    installTurnstile();
    const { result } = mount("site-key");
    const { form, input, requestSubmit } = makeForm();
    const { event, preventDefault } = submitEvent(form);

    let proceed = true;
    act(() => {
      proceed = result.current.guardSubmit(event);
    });
    expect(proceed).toBe(false);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(result.current.verifying).toBe(true);
    expect(requestSubmit).not.toHaveBeenCalled();

    input.value = "token";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(requestSubmit).toHaveBeenCalledOnce();
    expect(result.current.verifying).toBe(false);
  });

  it("ignores extra taps while it is already waiting", async () => {
    installTurnstile();
    const { result } = mount("site-key");
    const { form, input, requestSubmit } = makeForm();
    act(() => {
      result.current.guardSubmit(submitEvent(form).event);
      result.current.guardSubmit(submitEvent(form).event);
    });
    input.value = "token";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(requestSubmit).toHaveBeenCalledOnce();
  });

  it("gives up waiting on a widget error so the visitor is never stranded", () => {
    installTurnstile();
    const { result } = mount("site-key");
    act(() => captured?.["error-callback"]?.());
    expect(result.current.failed).toBe(true);

    const { form, requestSubmit } = makeForm();
    act(() => {
      result.current.guardSubmit(submitEvent(form).event);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.verifying).toBe(false);
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it("does not treat an expired token as a failure; it waits for the refreshed one", () => {
    installTurnstile();
    const { result } = mount("site-key");
    act(() => captured?.callback?.("token"));
    act(() => captured?.["expired-callback"]?.());
    expect(result.current.ready).toBe(false);
    expect(result.current.failed).toBe(false);
    act(() => captured?.callback?.("fresh-token"));
    expect(result.current.ready).toBe(true);
  });

  it("after a long wait, shows the visible check and asks the visitor to complete it", () => {
    installTurnstile();
    const { result } = mount("site-key");
    const { form, requestSubmit } = makeForm();
    act(() => {
      result.current.guardSubmit(submitEvent(form).event);
    });
    act(() => {
      vi.advanceTimersByTime(15_200);
    });
    expect(result.current.timedOut).toBe(true);
    expect(result.current.verifying).toBe(false);
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(captured?.appearance).toBe("always");
  });

  it("re-renders the widget visibly after a slow check even if nobody tapped", () => {
    installTurnstile();
    mount("site-key");
    expect(captured?.appearance).toBe("interaction-only");
    act(() => {
      vi.advanceTimersByTime(8001);
    });
    expect(removeSpy).toHaveBeenCalledOnce();
    expect(captured?.appearance).toBe("always");
  });

  it("does not re-render the widget when the invisible check finished in time", () => {
    installTurnstile();
    mount("site-key");
    act(() => captured?.callback?.("token"));
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(captured?.appearance).toBe("interaction-only");
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("reports a blocked script", () => {
    // No window.turnstile: the script never loaded.
    const { result } = mount("site-key");
    act(() => {
      vi.advanceTimersByTime(8500);
    });
    expect(result.current.scriptBlocked).toBe(true);
  });

  it("resets the widget by id", () => {
    installTurnstile();
    const { result } = mount("site-key");
    act(() => result.current.reset());
    expect(resetSpy).toHaveBeenCalledWith("test-widget");
  });
});
