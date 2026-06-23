"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, CircleNotch, Coins, Rss, Wallet, Lightning } from "@phosphor-icons/react/dist/ssr";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMicroUsdc, shortAddress, relativeTime } from "@/lib/price";

type Earnings = {
  publisher: { id: string; name: string; wallet_address: string; default_price_micro_usdc: number; verified: boolean };
  totals: { citations: number; totalMicroUsdc: number; total: string };
  payments: Array<{
    id: string;
    amount: string;
    amountMicroUsdc: number;
    network: string;
    status: string;
    transferId: string;
    title?: string;
    canonicalUrl?: string;
    createdAt: string;
  }>;
  walletEvents: Array<{ id: string; kind: string; amount_micro_usdc: number; status: string; created_at: string; tx_hash: string | null; to_address: string | null }>;
};

export default function PublisherDashboard() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = useSession();
  const toast = useToast();
  const [data, setData] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedUrl, setFeedUrl] = useState("");
  const [price, setPrice] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/publishers/${params.id}/earnings`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setData(data);
      if (data.publisher.default_price_micro_usdc) {
        setPrice(String(data.publisher.default_price_micro_usdc / 1_000_000));
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [params.id, toast]);

  useEffect(() => {
    if (status === "anonymous") {
      router.push("/login");
      return;
    }
    if (status === "authenticated" && params?.id) void load();
  }, [status, router, params, load]);

  async function importFeed() {
    if (!feedUrl) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/publishers/${params.id}/feeds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedUrl, priceUsd: price || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      toast.push("success", `Imported ${data.imported} sources from ${data.title}.`);
      setFeedUrl("");
      await load();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!withdrawTo || !withdrawAmount) return;
    setBusy(true);
    try {
      const res = await fetch("/api/wallets/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publisherId: params.id, toAddress: withdrawTo, amountUsd: withdrawAmount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");
      toast.push("success", `Sent ${formatMicroUsdc(data.amountMicroUsdc)} to ${shortAddress(data.recipientAddress)}.`);
      setWithdrawTo("");
      setWithdrawAmount("");
      await load();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-[1200px] px-5 py-16 flex items-center gap-2 text-zinc-500 text-sm">
        <CircleNotch size={14} className="animate-spin" /> Loading publisher…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <Link href="/publish" className="text-xs text-zinc-500 hover:text-emerald-300 flex items-center gap-1">
              <ArrowLeft size={12} /> Publishers
            </Link>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight">{data.publisher.name}</h1>
            <div className="text-xs text-zinc-500 amount mt-1">{data.publisher.wallet_address}</div>
          </div>
          <span className="chip">{data.publisher.verified ? "verified" : "pending verification"}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="panel p-5">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Citations</div>
            <div className="mt-2 amount text-2xl text-zinc-100">{data.totals.citations}</div>
          </div>
          <div className="panel p-5">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Earned</div>
            <div className="mt-2 amount text-2xl text-emerald-300">{data.totals.total}</div>
          </div>
          <div className="panel p-5">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Per citation</div>
            <div className="mt-2 amount text-2xl text-zinc-200">
              {formatMicroUsdc(data.publisher.default_price_micro_usdc)}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="panel p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-3">
              <Rss size={12} className="text-emerald-400" /> Import RSS / Atom feed
            </div>
            <Input
              label="Feed URL"
              name="feedUrl"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
            />
            <Input
              label="Per-citation price (USDC)"
              name="price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-3 amount"
            />
            <Button onClick={importFeed} loading={busy} className="mt-3 w-full">
              <Rss size={14} weight="bold" /> Import & price
            </Button>
          </div>
          <div className="panel p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-3">
              <Wallet size={12} className="text-emerald-400" /> Withdraw earnings
            </div>
            <Input
              label="Recipient address"
              name="withdrawTo"
              value={withdrawTo}
              onChange={(e) => setWithdrawTo(e.target.value)}
              placeholder="0x…"
            />
            <Input
              label="Amount (USDC)"
              name="withdrawAmount"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="mt-3 amount"
            />
            <Button onClick={withdraw} loading={busy} className="mt-3 w-full">
              <Coins size={14} weight="bold" /> Send via App Kit
            </Button>
          </div>
        </div>

        <div className="mt-6 panel">
          <div className="px-5 py-3 text-xs uppercase tracking-wider text-zinc-500 hairline flex items-center gap-2">
            <Lightning size={12} className="text-emerald-400" /> Recent citations
          </div>
          {data.payments.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-500">
              No citations yet. Once agents start paying, you&apos;ll see them here in real time.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {data.payments.map((p) => (
                <li key={p.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{p.title || "Citation"}</div>
                    <div className="text-xs text-zinc-500 amount">
                      {p.network} · {shortAddress(p.transferId, 6)} · {relativeTime(p.createdAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="amount text-emerald-300">{p.amount}</div>
                    <div className="text-xs text-zinc-500 capitalize">{p.status}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}
