"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { E3dSessionUser } from "@/lib/e3d-session";

type E3dSessionContextValue = {
  session: E3dSessionUser | null;
  refresh: () => Promise<void>;
  setSession: (session: E3dSessionUser) => void;
};

const E3dSessionContext = createContext<E3dSessionContextValue | null>(null);

// A single source of truth for the header (and anything else) to read the
// visitor's e3d.ai session from. Login/logout call setSession directly
// (or refresh() to re-fetch) so every consumer updates immediately --
// router.refresh() alone re-runs Server Components but does not re-run an
// already-mounted Client Component's effects, so a component that fetched
// its own copy of the session on mount would otherwise stay stale forever.
export function E3dSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<E3dSessionUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/e3d-session");
      const data = (await response.json()) as E3dSessionUser;
      setSession(data);
    } catch {
      setSession({ authenticated: false });
    }
  }, []);

  // Deliberately not just `useEffect(() => { void refresh(); }, [refresh])`:
  // calling an extracted async function from an effect reads, to static
  // analysis, like it could setState synchronously within the effect. This
  // inline fetch is the same request, just written so the async boundary
  // is unambiguous. `refresh` itself is still exported for event handlers
  // (login/logout) to call directly -- that's not an effect, so it's fine.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/e3d-session")
      .then((response) => response.json())
      .then((data: E3dSessionUser) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => {
        if (!cancelled) setSession({ authenticated: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <E3dSessionContext.Provider value={{ session, refresh, setSession }}>
      {children}
    </E3dSessionContext.Provider>
  );
}

export function useE3dSession() {
  const context = useContext(E3dSessionContext);
  if (!context) {
    throw new Error("useE3dSession must be used within E3dSessionProvider");
  }
  return context;
}
