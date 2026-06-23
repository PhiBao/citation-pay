"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Storefront, Rss, Sparkle, Wallet } from "@phosphor-icons/react/dist/ssr";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PublishLanding() {
  const { status } = useSession();
  const [publishers, setPublishers] = useState<Array<{ id: string; name: string; wallet_address: string; verified: boolean }>>([]);
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [price, setPrice] = useState("0.001");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      void fetch("/api/publishers/claim")
        .then((r) => r.json())
        .then((d) => setPublishers(d.publishers || []));
    }
  }, [status]);

  async function createPublisher() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/publishers/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publisherName: name, walletAddress: wallet, basePriceUsd: price })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      setName("");
      setWallet("");
      const list = await fetch("/api/publishers/claim").then((r) => r.json());
      setPublishers(list.publishers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <section className="border-b border-zinc-900">
        <div className="mx-auto max-w-[1200px] px-5 py-16 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05]">
              Get paid per citation.
            </h1>
            <p className="mt-5 text-zinc-400 leading-relaxed max-w-md">
              Point CitationPay at your RSS feed, set a per-citation price, and USDC lands in your wallet every time an
              agent grounds an answer in your work.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#onboard">
                <Button>
                  <Storefront size={15} weight="bold" /> Onboard a publisher
                </Button>
              </a>
              <Link href="/app/mcp">
                <Button variant="ghost">Try the MCP server</Button>
              </Link>
            </div>
          </div>
          <div className="panel-2 p-6">
            <ul className="space-y-4 text-sm text-zinc-300">
              <li className="flex items-start gap-3">
                <Rss size={18} weight="duotone" className="text-emerald-300 mt-0.5" />
                <div>
                  <div className="font-medium text-zinc-100">Import a feed</div>
                  <div className="text-zinc-500">Paste your RSS or Atom URL. CitationPay re-imports it as priced sources.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Coins size={18} weight="duotone" className="text-emerald-300 mt-0.5" />
                <div>
                  <div className="font-medium text-zinc-100">Set a per-citation price</div>
                  <div className="text-zinc-500">A few hundred micro-USDC per citation. No monthly minimum, no platform skim.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Wallet size={18} weight="duotone" className="text-emerald-300 mt-0.5" />
                <div>
                  <div className="font-medium text-zinc-100">Withdraw anytime</div>
                  <div className="text-zinc-500">Earnings settle into your Arc wallet. Withdraw to any chain via App Kit Send.</div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section id="onboard" className="border-b border-zinc-900">
        <div className="mx-auto max-w-[1200px] px-5 py-16 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Onboard a publisher</h2>
            <p className="mt-3 text-zinc-400 leading-relaxed max-w-md">
              {status === "authenticated" ? (
                <>Create a publisher record to claim an RSS feed and start earning.</>
              ) : (
                <>Sign in to claim a publisher identity and import a feed.</>
              )}
            </p>
            {status === "anonymous" && (
              <div className="mt-4">
                <Link href="/login?mode=signup">
                  <Button>
                    <Sparkle size={14} weight="fill" /> Create your account
                  </Button>
                </Link>
              </div>
            )}
            {status === "authenticated" && publishers.length > 0 && (
              <div className="mt-5">
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Your publishers</div>
                <ul className="space-y-2">
                  {publishers.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/publish/${p.id}`}
                        className="flex items-center justify-between rounded-[10px] border border-zinc-800 px-4 py-3 hover:border-emerald-400/30"
                      >
                        <div>
                          <div className="text-sm text-zinc-200">{p.name}</div>
                          <div className="text-xs text-zinc-500 amount">{p.wallet_address}</div>
                        </div>
                        <span className="chip">{p.verified ? "verified" : "pending"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {status === "authenticated" && (
            <div className="panel-2 p-6">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">New publisher</div>
              <div className="space-y-3">
                <Input
                  label="Publisher name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Newsletter"
                />
                <Input
                  label="Receiving wallet (Arc Testnet, 0x…)"
                  name="wallet"
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  placeholder="0x…"
                />
                <div>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">Per-citation price (USDC)</span>
                  <div className="flex items-center rounded-[10px] border border-zinc-800 bg-zinc-950 pl-3 pr-3 py-2">
                    <span className="text-zinc-500 mr-1">$</span>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full bg-transparent text-sm amount outline-none"
                    />
                  </div>
                </div>
                {error && (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {error}
                  </div>
                )}
                <Button onClick={createPublisher} loading={submitting} className="w-full">
                  Claim publisher
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
