"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowsClockwise, SignOut, Sparkle, User, ListChecks, Receipt, House } from "@phosphor-icons/react/dist/ssr";
import { useSession } from "./session-provider";
import { Logo } from "./logo";

const NAV_LINKS = [
  { href: "/app", label: "Account", icon: User },
  { href: "/app/playground", label: "Playground", icon: Sparkle },
  { href: "/app/mcp", label: "MCP", icon: ListChecks },
  { href: "/app/receipts", label: "Receipts", icon: Receipt }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, user, signOut } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const onLanding = pathname === "/";
  const showNav = !onLanding;

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {showNav && (
        <header className="sticky top-0 z-30 border-b border-zinc-900/80 backdrop-blur-md bg-zinc-950/70">
          <div className="mx-auto flex h-[64px] max-w-[1200px] items-center gap-4 px-5">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Logo size={28} />
              <span className="text-[15px] font-semibold tracking-tight">CitationPay</span>
            </Link>
            <nav className="ml-3 hidden md:flex items-center gap-1 text-sm">
              {NAV_LINKS.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
                      active
                        ? "bg-emerald-400/10 text-emerald-300 border border-emerald-400/20"
                        : "text-zinc-400 hover:text-zinc-100 border border-transparent"
                    }`}
                  >
                    <Icon size={15} weight="regular" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex-1" />
            {status === "authenticated" && user?.account ? (
              <div className="hidden md:flex items-center gap-3">
                <span className="amount text-sm text-emerald-300">
                  ${(user.account.balanceMicroUsdc / 1_000_000).toFixed(6)}
                </span>
                <span className="text-zinc-500">·</span>
                <span className="text-xs text-zinc-400">{user.email}</span>
                <button
                  onClick={handleSignOut}
                  className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:border-rose-500/30 hover:text-rose-300 flex items-center gap-1.5"
                >
                  <SignOut size={13} weight="regular" />
                  Sign out
                </button>
              </div>
            ) : status === "anonymous" ? (
              <div className="hidden md:flex items-center gap-2">
                <Link href="/login" className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:border-emerald-400/30">
                  Sign in
                </Link>
                <Link href="/login?mode=signup" className="btn-primary !py-1.5 !px-3.5 !text-xs">
                  Create account
                </Link>
              </div>
            ) : null}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-200"
              aria-label="Menu"
            >
              {mobileOpen ? "Close" : "Menu"}
            </button>
          </div>
          {mobileOpen && (
            <div className="md:hidden border-t border-zinc-900 bg-zinc-950/95">
              <div className="mx-auto max-w-[1200px] flex flex-col gap-1 p-3 text-sm">
                <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-300">
                  <House size={16} /> Home
                </Link>
                {NAV_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-300"
                    >
                      <Icon size={16} /> {link.label}
                    </Link>
                  );
                })}
                {status === "authenticated" ? (
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-rose-300"
                  >
                    <SignOut size={16} /> Sign out
                  </button>
                ) : (
                  <Link href="/login" className="flex items-center gap-2 rounded-lg px-3 py-2 text-emerald-300">
                    <ArrowsClockwise size={16} /> Sign in / Sign up
                  </Link>
                )}
              </div>
            </div>
          )}
        </header>
      )}
      <main className="flex-1">{children}</main>
      <footer className="border-t border-zinc-900/80 mt-20">
        <div className="mx-auto max-w-[1200px] px-5 py-10 flex flex-col md:flex-row gap-6 md:items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span>CitationPay · paid citations for AI agents on Arc</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>x402 nanopayments</span>
            <span>·</span>
            <span>Arc testnet</span>
            <span>·</span>
            <span>USDC</span>
            <span>·</span>
            <Link href="/publish" className="hover:text-emerald-300">For publishers</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
