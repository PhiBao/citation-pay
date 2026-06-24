"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, CloudArrowDown, CircleNotch, Globe, Newspaper, Robot, Sparkle, Users, Wallet } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { useSession } from "@/components/session-provider";

const FEATURED_INSTANCES = [
  { name: "mastodon.social", description: "The original Mastodon instance. 200k+ users.", users: "200k+" },
  { name: "mastodon.online", description: "General-purpose instance. 100k+ users.", users: "100k+" },
  { name: "fosstodon.org", description: "Open source community. 40k+ users.", users: "40k+" },
  { name: "hachyderm.io", description: "Tech professionals. 50k+ users.", users: "50k+" },
  { name: "mstdn.social", description: "General community. 80k+ users.", users: "80k+" },
  { name: "indieweb.social", description: "IndieWeb community. 15k+ users.", users: "15k+" }
];

type ImportResult = {
  instance: { title: string; host: string; users: number; statuses: number };
  imported: number;
  authors: number;
  details: Array<{ author: string; posts: number; price: string }>;
};

export default function MastodonPage() {
  const { status } = useSession();
  const toast = useToast();
  const [instanceUrl, setInstanceUrl] = useState("mastodon.social");
  const [hashtag, setHashtag] = useState("");
  const [price, setPrice] = useState("0.001");
  const [mode, setMode] = useState<"public" | "hashtag">("public");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function importPosts() {
    if (!instanceUrl) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/mastodon/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instanceUrl,
          mode,
          hashtag: hashtag || undefined,
          priceUsd: price,
          limit: 20
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
      toast.push("success", `Imported ${data.imported} posts from ${data.authors} authors.`);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-zinc-900">
        <div className="mx-auto max-w-[1200px] px-5 py-16">
          <Link href="/" className="text-xs text-zinc-500 hover:text-emerald-300 flex items-center gap-1 mb-6">
            <ArrowLeft size={12} /> Back home
          </Link>
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              <div>
                <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05]">
                  Paid citations for the fediverse.
                </h1>
                <p className="mt-5 text-zinc-400 leading-relaxed max-w-lg">
                  Connect any Mastodon instance to CitationPay. Every public post becomes a priced source. AI agents pay
                  per citation via x402 on Arc, and the post author earns USDC — automatically.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href="#import">
                    <Button>
                      <CloudArrowDown size={15} weight="bold" /> Import an instance
                    </Button>
                  </a>
                  <Link href="/publish">
                    <Button variant="ghost">
                      <Wallet size={15} /> Claim your earnings
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="panel-2 p-6">
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">How it works</div>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-400/20 flex items-center justify-center text-emerald-300 text-[10px] font-bold">1</div>
                    <div>
                      <div className="text-sm font-medium text-zinc-200">Instance admin imports posts</div>
                      <div className="text-xs text-zinc-500">Paste a Mastodon instance URL. CitationPay fetches public posts via the Mastodon API.</div>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-400/20 flex items-center justify-center text-emerald-300 text-[10px] font-bold">2</div>
                    <div>
                      <div className="text-sm font-medium text-zinc-200">Posts become priced sources</div>
                      <div className="text-xs text-zinc-500">Every post gets a per-citation price. By hashtag or by timeline. The author becomes the publisher.</div>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-400/20 flex items-center justify-center text-emerald-300 text-[10px] font-bold">3</div>
                    <div>
                      <div className="text-sm font-medium text-zinc-200">Agents pay per citation</div>
                      <div className="text-xs text-zinc-500">When an AI agent cites a Mastodon post, x402 nanopayments settle to the author&apos;s wallet on Arc. Gasless. Sub-cent. Under a second.</div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured instances */}
      <section className="border-b border-zinc-900">
        <div className="mx-auto max-w-[1200px] px-5 py-12">
          <h2 className="text-xl font-semibold tracking-tight mb-6">50,000+ instances · 15 million+ users</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {FEATURED_INSTANCES.map((instance) => (
              <button
                key={instance.name}
                onClick={() => setInstanceUrl(instance.name)}
                className={`text-left panel p-4 hover:border-emerald-400/30 transition-colors ${instanceUrl === instance.name ? "border-emerald-400/40 bg-emerald-400/5" : ""}`}
              >
                <div className="text-sm font-medium text-zinc-200">{instance.name}</div>
                <div className="text-xs text-zinc-500 mt-1">{instance.users} users</div>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            These are just examples. CitationPay works with any Mastodon-compatible instance — including Pleroma,
            Akkoma, GoToSocial, and any ActivityPub server with a public API.
          </p>
        </div>
      </section>

      {/* Import form */}
      <section id="import" className="border-b border-zinc-900">
        <div className="mx-auto max-w-[1200px] px-5 py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Import a Mastodon instance</h2>
          <p className="text-sm text-zinc-500 mt-1 mb-6">
            Fetches public posts via the Mastodon API and registers them as priced sources on CitationPay.
            {status === "anonymous" && " Sign in to import."}
          </p>

          {status === "anonymous" ? (
            <Link href="/login?mode=signup">
              <Button>
                <Sparkle size={14} weight="fill" /> Create an account to import
              </Button>
            </Link>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="panel p-6 space-y-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-3">
                  <Globe size={12} className="text-emerald-400" /> Instance
                </div>
                <Input
                  label="Mastodon instance URL"
                  name="instanceUrl"
                  value={instanceUrl}
                  onChange={(e) => setInstanceUrl(e.target.value)}
                  placeholder="mastodon.social or https://fosstodon.org"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setMode("public")}
                    className={`flex-1 rounded-[10px] border px-4 py-3 text-sm transition-colors ${mode === "public" ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-200" : "border-zinc-800 text-zinc-300 hover:border-zinc-700"}`}
                  >
                    <Globe size={14} className="inline mr-1.5" />
                    Public timeline
                  </button>
                  <button
                    onClick={() => setMode("hashtag")}
                    className={`flex-1 rounded-[10px] border px-4 py-3 text-sm transition-colors ${mode === "hashtag" ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-200" : "border-zinc-800 text-zinc-300 hover:border-zinc-700"}`}
                  >
                    <span className="font-mono text-sm mr-1">#</span>
                    By hashtag
                  </button>
                </div>
                {mode === "hashtag" && (
                  <Input
                    label="Hashtag"
                    name="hashtag"
                    value={hashtag}
                    onChange={(e) => setHashtag(e.target.value)}
                    placeholder="e.g. citationpay"
                  />
                )}
                <Input
                  label="Per-citation price (USDC)"
                  name="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="amount"
                />
                <Button onClick={importPosts} loading={busy} className="w-full">
                  <CloudArrowDown size={14} weight="bold" /> Import posts as priced sources
                </Button>
              </div>

              <div className="panel p-6 min-h-[300px]">
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Result</div>
                {busy ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <CircleNotch size={14} className="animate-spin text-emerald-300" />
                    Fetching from Mastodon API…
                  </div>
                ) : result ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="panel-2 p-3">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Instance</div>
                        <div className="text-sm font-medium text-zinc-200 mt-1">{result.instance.title}</div>
                        <div className="text-xs text-zinc-500">{result.instance.host} · {result.instance.users.toLocaleString()} users</div>
                      </div>
                      <div className="panel-2 p-3">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Imported</div>
                        <div className="text-lg font-semibold text-emerald-300 mt-1">{result.imported} posts</div>
                        <div className="text-xs text-zinc-500">{result.authors} authors</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Authors</div>
                      <ul className="space-y-1.5 text-xs">
                        {result.details.map((d) => (
                          <li key={d.author} className="flex justify-between items-center panel-2 px-3 py-2">
                            <span className="text-zinc-300">@{d.author}</span>
                            <span className="text-zinc-500">{d.posts} posts · {d.price}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="panel-2 p-3 text-xs text-zinc-500">
                      <span className="text-emerald-300">Ready.</span> These posts are now priced sources. AI agents that match them in a search will pay per citation. Post
                      authors earn USDC on Arc.
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
                    <Newspaper size={28} className="text-zinc-600 mb-3" />
                    <p className="text-sm">Pick an instance and click import.</p>
                    <p className="text-xs mt-1">CitationPay will fetch public posts and register them as priced sources.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* For instance admins */}
      <section className="border-b border-zinc-900">
        <div className="mx-auto max-w-[1200px] px-5 py-12 grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">For instance admins</h2>
            <p className="mt-3 text-zinc-400 leading-relaxed max-w-md">
              Adding CitationPay to your Mastodon instance means every creator on your server earns when their posts are
              cited by an AI agent. No configuration needed on the creator&apos;s side — just the instance URL and a per-citation
              price.
            </p>
            <div className="mt-5 space-y-3 text-sm text-zinc-300">
              <div className="flex items-start gap-3">
                <Users size={16} className="text-emerald-300 mt-0.5" />
                <span>Imports work with the Mastodon public API — no authentication, no server-side changes, no plugin to install.</span>
              </div>
              <div className="flex items-start gap-3">
                <Wallet size={16} className="text-emerald-300 mt-0.5" />
                <span>Payouts settle to Arc wallets. Instance admins can set a single receiving wallet or let individual creators claim theirs.</span>
              </div>
              <div className="flex items-start gap-3">
                <Robot size={16} className="text-emerald-300 mt-0.5" />
                <span>Full MCP server included. AI agents discover and pay per citation through the same x402 rail CitationPay uses for RSS publishers.</span>
              </div>
            </div>
          </div>
          <div className="panel-2 p-6 amount text-xs leading-relaxed overflow-x-auto">
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Deploy the sidecar</div>
            <pre className="text-zinc-300">{`# Clone the CitationPay repo
git clone https://github.com/your-org/citationpay

# Set environment
cp .env.example .env.local
# Add your CIRCLE_API_KEY, ARC_RPC_URL, etc.

# Seed some Mastodon content
curl -X POST https://lepton.thecanteenapp.com/api/mastodon/import \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer cp_live_...' \\
  --data '{"instanceUrl":"mastodon.social","mode":"public","priceUsd":"0.001"}'

# Done. Mastodon posts are now priced sources.
# Agents pay per citation via x402 on Arc.
# Authors earn USDC.`}</pre>
          </div>
        </div>
      </section>

      {/* Distribution */}
      <section className="border-b border-zinc-900">
        <div className="mx-auto max-w-[1200px] px-5 py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Distribution through existing communities</h2>
          <p className="mt-3 text-zinc-400 leading-relaxed max-w-lg">
            CitationPay attaches nanopayments to communities that already exist. Mastodon is the first — with 50,000+
            instances and 15 million+ users. More integrations planned for Ghost, PeerTube, and Owncast.
          </p>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="panel p-4 text-center">
              <div className="text-2xl font-semibold text-emerald-300">50k+</div>
              <div className="text-xs text-zinc-500 mt-1">Mastodon instances</div>
            </div>
            <div className="panel p-4 text-center">
              <div className="text-2xl font-semibold text-emerald-300">15M+</div>
              <div className="text-xs text-zinc-500 mt-1">Fediverse users</div>
            </div>
            <div className="panel p-4 text-center">
              <div className="text-2xl font-semibold text-emerald-300">54k★</div>
              <div className="text-xs text-zinc-500 mt-1">Ghost CMS (next)</div>
            </div>
            <div className="panel p-4 text-center">
              <div className="text-2xl font-semibold text-emerald-300">44k★</div>
              <div className="text-xs text-zinc-500 mt-1">RSSHub (next)</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
