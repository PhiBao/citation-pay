"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { EnvelopeSimple, LockKey, ShieldCheck, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { useToast } from "@/components/toast";
import { useSession } from "@/components/session-provider";

type Mode = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[80dvh] flex items-center justify-center text-zinc-500">Loading…</div>}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useSession();
  const initialMode: Mode = params.get("mode") === "signin" ? "signin" : "signup";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name: name || email.split("@")[0] })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Authentication failed");
      }
      await refresh();
      toast.push("success", mode === "signup" ? "Welcome to CitationPay." : "Signed in.");
      router.push(data.redirect || "/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[80dvh] flex items-center justify-center px-5 py-16">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <Logo size={32} />
          <span className="text-base font-semibold">CitationPay</span>
        </Link>
        <div className="panel-2 p-7">
          <h1 className="text-xl font-semibold tracking-tight">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            {mode === "signup"
              ? "Trial credit, a real Arc wallet, and a default agent API key on us."
              : "Sign in to fund your balance and run paid citations."}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <Input
                label="Display name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="name"
                required
              />
            )}
            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">Email</span>
              <div className="flex items-center rounded-[10px] border border-zinc-800 bg-zinc-950 pl-3 pr-3 py-1 focus-within:border-emerald-400/60 focus-within:ring-2 focus-within:ring-emerald-400/15">
                <EnvelopeSimple size={14} className="text-zinc-500 mr-2" />
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-transparent py-1.5 text-sm outline-none"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">Password</span>
              <div className="flex items-center rounded-[10px] border border-zinc-800 bg-zinc-950 pl-3 pr-3 py-1 focus-within:border-emerald-400/60 focus-within:ring-2 focus-within:ring-emerald-400/15">
                <LockKey size={14} className="text-zinc-500 mr-2" />
                <input
                  type="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full bg-transparent py-1.5 text-sm outline-none"
                  placeholder="At least 8 characters"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>
            </div>
            {error && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </div>
            )}
            <Button type="submit" loading={loading} className="w-full">
              <Sparkle size={15} weight="fill" />
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-zinc-500">
            {mode === "signup" ? "Already have an account?" : "New to CitationPay?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="text-emerald-300 hover:underline underline-offset-4"
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-zinc-500 flex items-center justify-center gap-1.5">
          <ShieldCheck size={12} weight="duotone" className="text-zinc-500" />
          API keys never touch your browser once issued.
        </p>
      </motion.div>
    </div>
  );
}
