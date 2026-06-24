"use client";
import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowsClockwise,
  CircleNotch,
  Coins,
  Key,
  Receipt,
  ShieldCheck,
  Stack,
  Wallet
} from "@phosphor-icons/react/dist/ssr";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { formatMicroUsdc, shortAddress, relativeTime } from "@/lib/price";

type AccountData = {
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
  };
  apiKey: { id: string; name: string; prefix: string; lastUsedAt: string | null };
  keys: Array<{ id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string }>;
  walletEvents: Array<{
    id: string;
    kind: "deposit" | "sweep" | "withdrawal" | "faucet" | "settlement";
    amount_micro_usdc: number;
    network: string;
    from_address: string | null;
    to_address: string | null;
    status: "pending" | "confirmed" | "failed";
    created_at: string;
  }>;
};

export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-[1200px] px-5 py-16">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <CircleNotch size={14} className="animate-spin" />
          Loading your account…
        </div>
      </div>
    }>
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const toast = useToast();
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = (await res.json()) as AccountData;
      setData(json);
    } catch {
      toast.push("error", "Failed to load account");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const welcomeShown = useRef(false);

  useEffect(() => {
    if (status === "anonymous") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      void load();
      if (!welcomeShown.current && params.get("welcome") === "1") {
        welcomeShown.current = true;
        toast.push("success", "Welcome to CitationPay. Trial credit added.");
        router.replace("/app");
      }
    }
  }, [status, load, params, router, toast]);

  // Re-fetch if wallet is still being minted
  useEffect(() => {
    if (data && !data.account.circleWalletAddress) {
      const timer = setTimeout(() => { void load(); }, 2000);
      return () => clearTimeout(timer);
    }
  }, [data, load]);

  if (status === "loading" || loading || !data) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16">
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <CircleNotch size={14} className="animate-spin" />
          Loading your account…
        </div>
      </div>
    );
  }

  const { account, apiKey, walletEvents } = data;

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-baseline justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Account</h1>
            <p className="text-sm text-zinc-500 mt-1">Trial-funded balance, Arc wallet, and your agent API key.</p>
          </div>
          <Link href="/app/playground">
            <Button>
              <ArrowsClockwise size={15} weight="bold" /> Run a paid citation
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="panel p-6 md:col-span-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
              <Wallet size={12} className="text-emerald-400" />
              Balance
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="amount text-4xl font-semibold text-emerald-300">
                {formatMicroUsdc(account.balanceMicroUsdc)}
              </span>
              <span className="text-sm text-zinc-500">USDC</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm text-zinc-400">
              <div>
                <div className="text-xs text-zinc-500">Trial credit</div>
                <div className="amount">{formatMicroUsdc(account.trialCreditMicroUsdc)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Per-run limit</div>
                <div className="amount">{formatMicroUsdc(account.perRunLimitMicroUsdc)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Daily limit</div>
                <div className="amount">{formatMicroUsdc(account.dailyLimitMicroUsdc)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Arc wallet</div>
                <div className="amount text-zinc-200 text-xs mt-0.5">
                  {account.circleWalletAddress
                    ? shortAddress(account.circleWalletAddress, 6)
                    : "minting…"}
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Link href="/app/deposit">
                <Button>
                  <Coins size={14} weight="bold" /> Deposit USDC
                </Button>
              </Link>
              <Link href="/app/mcp">
                <Button variant="ghost">
                  <Stack size={14} weight="regular" /> Connect MCP
                </Button>
              </Link>
            </div>
          </div>
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
              <Key size={12} className="text-emerald-400" />
              Default agent key
            </div>
            <div className="mt-2 text-sm text-zinc-200">{apiKey.name}</div>
            <div className="mt-1 text-xs text-zinc-500 amount">
              prefix <span className="text-zinc-300">{apiKey.prefix}…</span>
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Last used: {apiKey.lastUsedAt ? relativeTime(apiKey.lastUsedAt) : "—"}
            </div>
            <Link href="/app/keys" className="mt-3 inline-block text-xs text-emerald-300 hover:underline">
              Manage keys →
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
              <Receipt size={12} className="text-emerald-400" />
              Wallet activity
            </div>
            {walletEvents.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No wallet activity yet. Try a deposit.</p>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-900">
                {walletEvents.map((event) => (
                  <li key={event.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <div className="text-zinc-200 capitalize">{event.kind}</div>
                      <div className="text-xs text-zinc-500">
                        {event.network} · {relativeTime(event.created_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="amount text-emerald-300">{formatMicroUsdc(event.amount_micro_usdc)}</div>
                      <div className="text-xs text-zinc-500 capitalize">{event.status}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
              <ShieldCheck size={12} className="text-emerald-400" />
              What this account does
            </div>
            <ul className="mt-3 space-y-2 text-sm text-zinc-400">
              <li>
                Funds x402 nanopayments to publishers when your agent cites a source.
              </li>
              <li>
                Holds a Circle developer-controlled wallet on Arc Testnet for deposits and sweeps.
              </li>
              <li>
                Records every paid citation in your decision ledger and onchain receipts.
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
