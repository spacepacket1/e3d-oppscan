// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
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

describe("useTurnstile", () => {
  it("is never 'checking' when no site key is configured", () => {
    const { result } = renderHook(() => useTurnstile("test-widget", ""));
    expect(result.current.ready).toBe(true);
    expect(result.current.checking).toBe(false);
  });

  it("renders in interaction-only mode and holds the button until the token arrives", () => {
    installTurnstile();
    const { result } = mount("site-key");
    expect(captured?.appearance).toBe("interaction-only");
    expect(captured?.sitekey).toBe("site-key");
    expect(result.current.checking).toBe(true);

    act(() => captured?.callback?.("token"));
    expect(result.current.checking).toBe(false);
    expect(result.current.ready).toBe(true);
  });

  it("releases the button on a widget error so the visitor is never stranded", () => {
    installTurnstile();
    const { result } = mount("site-key");
    act(() => captured?.["error-callback"]?.());
    expect(result.current.failed).toBe(true);
    expect(result.current.checking).toBe(false);
  });

  it("holds the button again when a token expires, then releases it on the next token", () => {
    installTurnstile();
    const { result } = mount("site-key");
    act(() => captured?.callback?.("token"));
    act(() => captured?.["expired-callback"]?.());
    expect(result.current.ready).toBe(false);
    act(() => captured?.callback?.("fresh-token"));
    expect(result.current.ready).toBe(true);
    expect(result.current.failed).toBe(false);
  });

  it("releases the button after a slow check, and re-renders the widget visibly as a backstop", () => {
    installTurnstile();
    const { result } = mount("site-key");
    expect(captured?.appearance).toBe("interaction-only");
    expect(result.current.checking).toBe(true);
    act(() => {
      vi.advanceTimersByTime(8001);
    });
    expect(result.current.checking).toBe(false);
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

  it("reports a blocked script and releases the button", () => {
    // No window.turnstile: the script never loaded.
    const { result } = mount("site-key");
    expect(result.current.checking).toBe(true);
    act(() => {
      vi.advanceTimersByTime(8500);
    });
    expect(result.current.scriptBlocked).toBe(true);
    expect(result.current.checking).toBe(false);
  });

  it("resets the widget by id", () => {
    installTurnstile();
    const { result } = mount("site-key");
    act(() => result.current.reset());
    expect(resetSpy).toHaveBeenCalledWith("test-widget");
  });
});
