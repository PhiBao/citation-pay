"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowsClockwise,
  CheckCircle,
  Coins,
  Globe,
  Lightning,
  Quotes,
  Robot,
  ShieldCheck,
  Sparkle,
  Stack,
  Storefront,
  Wallet
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { formatMicroUsdc, shortAddress } from "@/lib/price";

type DashboardData = {
  accounts: Array<{ id: string; created_at: string }>;
  publishers: Array<{ id: string; name: string; wallet_address: string; default_price_micro_usdc: number }>;
  feeds: Array<{ id: string; status: string }>;
  sources: Array<{ id: string; price_micro_usdc: number; publisher: { name: string } }>;
  runs: Array<{ id: string; created_at: string; query: string; spent_micro_usdc: number; status: string; client_type: string }>;
  payments: Array<{
    id: string;
    amount_micro_usdc: number;
    status: string;
    created_at: string;
    source?: { title: string; publisher: { name: string } };
  }>;
  decisions: unknown[];
  cache: unknown[];
  health: { database: string; error: string | null };
  paymentMode: string;
};

export default function LandingPage() {
  const { status } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null));
  }, []);

  const totals = data
    ? {
        publishers: data.publishers.length,
        sources: data.sources.length,
        paidCitations: data.payments.length,
        volume: data.payments.reduce((s, p) => s + p.amount_micro_usdc, 0),
        runs: data.runs.length
      }
    : null;

  return (
    <div>
      <Hero signedIn={status === "authenticated"} />
      <LiveProof totals={totals} mode={data?.paymentMode} />
      <HowItWorks />
      <StackSection />
      <FediverseSection />
      <PublisherCallout />
      <DeveloperCallout signedIn={status === "authenticated"} />
    </div>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative">
      <div className="mx-auto max-w-[1200px] px-5 pt-20 md:pt-28 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-6">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live on Arc Testnet · USDC settlement</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-[-0.025em] leading-[1.05]">
            Citation is a <em className="not-italic text-emerald-300">payable event</em>.
          </h1>
          <p className="mt-5 max-w-xl text-base md:text-lg text-zinc-400 leading-relaxed">
            CitationPay gives AI agents a paid-citation account. They search, score, and pay per citation via x402
            nanopayments on Arc. Publishers earn USDC the moment their work grounds an answer.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <Link href="/app/playground">
                <Button>
                  <Sparkle size={15} weight="fill" /> Open the playground
                </Button>
              </Link>
            ) : (
              <Link href="/login?mode=signup">
                <Button>
                  <ArrowsClockwise size={15} weight="bold" /> Create your account
                </Button>
              </Link>
            )}
            <Link href="/publish">
              <Button variant="ghost">
                <Storefront size={15} weight="regular" /> For publishers
              </Button>
            </Link>
            <Link
              href="/app/mcp"
              className="text-xs text-zinc-500 hover:text-emerald-300 underline-offset-4 hover:underline"
            >
              Or connect any MCP client →
            </Link>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="mt-14 panel p-1 overflow-hidden"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-900 rounded-[10px] overflow-hidden text-sm">
            <Step
              n="01"
              title="Agent searches"
              body="Heuristic + LLM cost/benefit ranking of priced publisher sources."
              icon={<Robot size={18} weight="duotone" />}
            />
            <Step
              n="02"
              title="Pays per citation"
              body="x402 nanopayments on Arc. Gasless. Sub-cent. Settled in under a second."
              icon={<Lightning size={18} weight="duotone" />}
            />
            <Step
              n="03"
              title="Publisher earns"
              body="Real USDC in the publisher's Circle wallet. Withdrawable to any chain."
              icon={<Wallet size={18} weight="duotone" />}
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Step({
  n,
  title,
  body,
  icon
}: {
  n: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-950 p-6">
      <div className="flex items-center gap-2 text-xs text-zinc-500 amount tracking-wider">
        <span className="text-emerald-400">{n}</span>
        <span>·</span>
        <span className="text-zinc-600">STEP</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-base font-semibold tracking-tight">
        <span className="text-emerald-300">{icon}</span>
        {title}
      </div>
      <p className="mt-2 text-zinc-400 leading-relaxed">{body}</p>
    </div>
  );
}

function LiveProof({ totals, mode }: { totals: { publishers: number; sources: number; paidCitations: number; volume: number; runs: number } | null; mode: string | undefined }) {
  return (
    <section className="border-t border-zinc-900">
      <div className="mx-auto max-w-[1200px] px-5 py-14">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl font-semibold tracking-tight">Live proof on Arc Testnet</h2>
          <span className="text-xs text-zinc-500 amount">{mode === "real" ? "real · testnet USDC" : mode ? "mock mode" : "loading…"}</span>
        </div>
        {totals ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-zinc-900 panel overflow-hidden">
            <Stat label="Publishers" value={totals.publishers.toString()} />
            <Stat label="Priced sources" value={totals.sources.toString()} />
            <Stat label="Paid citations" value={totals.paidCitations.toString()} />
            <Stat label="Volume" value={formatMicroUsdc(totals.volume)} accent />
            <Stat label="Agent runs" value={totals.runs.toString()} />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="panel p-5 h-[90px] animate-pulse bg-zinc-900/50" />
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          Numbers above come from <code className="amount text-zinc-400">/api/dashboard</code> and update whenever the seeded
          feeds are re-imported or a paid run is executed.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-zinc-950 p-5">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-2 amount text-2xl ${accent ? "text-emerald-300" : "text-zinc-100"}`}>{value}</div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="border-t border-zinc-900">
      <div className="mx-auto max-w-[1200px] px-5 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-zinc-300 font-medium">
              <Coins size={16} weight="duotone" className="text-emerald-300" />
              Fund your account
            </div>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Create an account, get a Circle developer-controlled wallet, and bridge USDC in from any chain via App Kit.
            </p>
          </div>
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-zinc-300 font-medium">
              <Robot size={16} weight="duotone" className="text-emerald-300" />
              Hand your agent the API key
            </div>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Connect any MCP-capable client (Claude Desktop, Cursor, Codex) to <code className="amount text-zinc-300">/api/mcp</code>{" "}
              using your <code className="amount text-zinc-300">cp_live_…</code> key.
            </p>
          </div>
          <div className="panel p-6">
            <div className="flex items-center gap-2 text-zinc-300 font-medium">
              <ShieldCheck size={16} weight="duotone" className="text-emerald-300" />
              Watch the receipts
            </div>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Every citation carries an onchain receipt, a decision reason, and a cache hit when the same content was paid
              before.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function StackSection() {
  return (
    <section className="border-t border-zinc-900">
      <div className="mx-auto max-w-[1200px] px-5 py-16 grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Built on the Circle stack</h2>
          <p className="mt-3 text-zinc-400 leading-relaxed max-w-md">
            CitationPay uses every layer Circle ships: developer-controlled wallets, App Kit for cross-chain deposits and
            withdrawals, Gateway nanopayments (x402), and USDC on Arc.
          </p>
        </div>
        <div className="panel-2 p-6">
          <div className="flex items-center gap-2 text-zinc-300 font-medium">
            <Stack size={16} weight="duotone" className="text-emerald-300" />
            Stack
          </div>
          <ul className="mt-4 space-y-3 text-sm text-zinc-300">
            <li className="flex items-start gap-3">
              <CheckCircle size={16} weight="duotone" className="text-emerald-300 mt-0.5" />
              <span>
                <strong className="text-zinc-100">Circle Wallets</strong> — per-account EOA on Arc Testnet, controlled by an entity secret.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle size={16} weight="duotone" className="text-emerald-300 mt-0.5" />
              <span>
                <strong className="text-zinc-100">Arc-native USDC</strong> — faucet credit or direct deposit to your Arc wallet. No bridges.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle size={16} weight="duotone" className="text-emerald-300 mt-0.5" />
              <span>
                <strong className="text-zinc-100">App Kit · Send</strong> — publishers withdraw earnings to any Arc address.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle size={16} weight="duotone" className="text-emerald-300 mt-0.5" />
              <span>
                <strong className="text-zinc-100">Gateway / x402</strong> — gasless, batched USDC settlement.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle size={16} weight="duotone" className="text-emerald-300 mt-0.5" />
              <span>
                <strong className="text-zinc-100">MCP · Streamable HTTP</strong> — a real server that any agent can connect to.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function FediverseSection() {
  return (
    <section className="border-t border-zinc-900">
      <div className="mx-auto max-w-[1200px] px-5 py-16">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Distribution
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Built on Mastodon — 50k+ instances, 15M+ users.
            </h2>
            <p className="mt-4 text-zinc-400 leading-relaxed max-w-md">
              CitationPay imports public posts from any Mastodon instance as priced sources. Every creator on the
              fediverse earns USDC when an AI agent cites their work. No plugin to install — just the public Mastodon API.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="panel-2 p-4">
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Open graph</div>
                <div className="mt-1 text-zinc-200">50,000+ Mastodon instances</div>
                <div className="text-xs text-zinc-500 mt-0.5">Any ActivityPub server with a public API</div>
              </div>
              <div className="panel-2 p-4">
                <div className="text-xs text-zinc-500 uppercase tracking-wider">No plugin needed</div>
                <div className="mt-1 text-zinc-200">Zero-config import</div>
                <div className="text-xs text-zinc-500 mt-0.5">Paste an instance URL, get priced sources</div>
              </div>
            </div>
            <div className="mt-4">
              <Link href="/mastodon">
                <Button>
                  <Globe size={15} weight="bold" /> Import from Mastodon
                </Button>
              </Link>
            </div>
          </div>
          <div className="panel-2 p-5 amount text-xs leading-relaxed">
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Works with any fediverse instance</div>
            <div className="grid grid-cols-2 gap-2 text-zinc-300">
              {["mastodon.social", "fosstodon.org", "hachyderm.io", "mstdn.social", "indieweb.social", "techhub.social", "mas.to", "mastodon.online"].map((h) => (
                <div key={h} className="panel px-3 py-2 text-zinc-300">{h}</div>
              ))}
            </div>
            <p className="mt-3 text-zinc-500">
              Also compatible with Pleroma, Akkoma, GoToSocial, and any ActivityPub server with a public API.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PublisherCallout() {
  return (
    <section className="border-t border-zinc-900">
      <div className="mx-auto max-w-[1200px] px-5 py-16">
        <div className="panel-2 p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center gap-8">
          <div className="flex-1">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Publishers get paid per citation.</h2>
            <p className="mt-3 text-zinc-400 leading-relaxed max-w-xl">
              Point CitationPay at your RSS feed. Set a per-citation price. Each time an agent grounds an answer in your
              work, USDC lands in your wallet. No monthly minimum, no platform skim — just a programmable per-citation
              revenue stream.
            </p>
            <div className="mt-5">
              <Link href="/publish">
                <Button variant="ghost">
                  <Storefront size={15} weight="regular" /> Become a publisher
                </Button>
              </Link>
            </div>
          </div>
          <div className="w-full md:w-[320px] shrink-0">
            <div className="panel p-5">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Example receipt</div>
              <div className="mt-3 text-sm text-zinc-300">The rhapsode was paid for the performance the crowd actually heard.</div>
              <dl className="mt-4 space-y-2 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <dt>Citation</dt>
                  <dd className="amount text-zinc-200">$0.001000</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Payer</dt>
                  <dd className="amount text-zinc-200">{shortAddress("0x4ba1e9e275ef61b56c99532d0066506436201d73")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Seller</dt>
                  <dd className="amount text-emerald-300">vitalik.eth</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Network</dt>
                  <dd className="amount text-zinc-200">Arc Testnet</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DeveloperCallout({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="border-t border-zinc-900">
      <div className="mx-auto max-w-[1200px] px-5 py-16 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Agent-native surface</h2>
          <p className="mt-3 text-zinc-400 leading-relaxed max-w-md">
            <code className="amount text-zinc-200">/api/mcp</code> speaks Model Context Protocol over
            Streamable HTTP. Connect Claude Desktop, Cursor, or Codex directly. Test any tool in the browser from the MCP
            page.
          </p>
        </div>
        <div className="panel-2 p-6 amount text-xs leading-relaxed overflow-x-auto">
          <pre className="text-zinc-300">{`{
  "mcpServers": {
    "citationpay": {
      "url": "https://lepton.thecanteenapp.com/api/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer cp_live_…"
      }
    }
  }
}`}</pre>
        </div>
        <div className="md:col-span-2 flex flex-wrap gap-3">
          {signedIn ? (
            <Link href="/app/mcp">
              <Button>
                <Quotes size={15} weight="duotone" /> Open the MCP page
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button>
                <Quotes size={15} weight="duotone" /> Sign in to test MCP
              </Button>
            </Link>
          )}
          <Link href="/publish">
            <Button variant="ghost">Publisher docs</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
