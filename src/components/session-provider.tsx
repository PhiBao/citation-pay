"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  supabaseUserId: string;
  account: {
    id: string;
    name: string;
    email: string;
    balanceMicroUsdc: number;
    trialCreditMicroUsdc: number;
    perRunLimitMicroUsdc: number;
    dailyLimitMicroUsdc: number;
    circleWalletId: string | null;
    circleWalletAddress: string | null;
    createdAt: string;
  } | null;
};

type SessionState = {
  status: "loading" | "anonymous" | "authenticated";
  user: SessionUser | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<SessionState, "refresh" | "signOut">>({
    status: "loading",
    user: null
  });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { user: SessionUser | null };
        setState({ status: data.user ? "authenticated" : "anonymous", user: data.user });
      } else {
        setState({ status: "anonymous", user: null });
      }
    } catch {
      setState({ status: "anonymous", user: null });
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setState({ status: "anonymous", user: null });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ ...state, refresh, signOut }}>{children}</SessionContext.Provider>
  );
}
