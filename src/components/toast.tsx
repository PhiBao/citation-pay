"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle, Warning, Info, X } from "@phosphor-icons/react/dist/ssr";

type ToastKind = "success" | "error" | "info";
type Toast = { id: string; kind: ToastKind; message: string };
type ToastContextValue = { push: (kind: ToastKind, message: string) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-sm items-start gap-3 panel-2 px-4 py-3 text-sm"
          >
            <div className="mt-0.5">
              {t.kind === "success" && <CheckCircle size={18} weight="duotone" className="text-emerald-400" />}
              {t.kind === "error" && <Warning size={18} weight="duotone" className="text-rose-400" />}
              {t.kind === "info" && <Info size={18} weight="duotone" className="text-zinc-300" />}
            </div>
            <div className="flex-1 leading-relaxed">{t.message}</div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-zinc-500 hover:text-zinc-200"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
