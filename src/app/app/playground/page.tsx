"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { CircleNotch, PaperPlaneTilt, Robot } from "@phosphor-icons/react/dist/ssr";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { UsdInput } from "@/components/ui/micro-usdc";
import { formatMicroUsdc } from "@/lib/price";

type AgentResult = {
  runId: string;
  answer: string;
  spentMicroUsdc: number;
  cacheEvents: number;
  reasoningUsed: boolean;
  retrieval: {
    status: "answered" | "no_coverage" | "provider_fallback";
    candidateCount: number;
    paidCardCount: number;
    composer: "dgrid" | "extractive" | "none";
    message: string;
  };
  account?: {
    id: string;
    balanceMicroUsdc: number;
  };
  ledger: Array<{
    sourceId: string;
    title: string;
    publisher: string;
    action: "paid" | "cached" | "skipped";
    score: number;
    price: string;
    reason: string;
  }>;
  decisions: Array<{
    sourceId: string;
    title: string;
    publisher: string;
    reason: string;
    price: string;
    receipt: string;
  }>;
};

const SAMPLE_PROMPTS = [
  "Summarize the latest thinking on stablecoin payment rails.",
  "What is changing in agent-to-agent payments on Arc?",
  "Explain how x402 nanopayments settle offchain authorizations.",
  "Compare AgentKit wallet approach to developer-controlled wallets."
];

export default function PlaygroundPage() {
  const toast = useToast();
  const [query, setQuery] = useState(SAMPLE_PROMPTS[0]);
  const [budget, setBudget] = useState("0.001");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (query.trim().length < 8) {
      toast.push("error", "Query must be at least 8 characters.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      let response: Response;
      try {
        response = await fetch("/api/agent/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, budgetUsd: budget }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
      const raw = await response.text();
      let data: { error?: string } & Partial<AgentResult> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(raw.slice(0, 180) || `HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setResult(data as AgentResult);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("The agent route did not finish within 45 seconds. The server keeps each LLM stage bounded; if this persists, check Vercel function logs and payment provider latency.");
      } else {
        const message = err instanceof Error ? err.message : "Run failed";
        setError(message === "Failed to fetch" ? "The browser could not reach the agent route. Check the deployment URL and function logs." : message);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Paid citation playground</h1>
            <p className="text-sm text-zinc-500 mt-1">Ask a question. Watch your agent search, score, and pay per citation via x402.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="panel p-5">
            <Textarea
              label="Query"
              name="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={6}
              hint="8–600 characters"
            />
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <UsdInput name="budget" defaultValue={budget} onValueChange={setBudget} />
              <div className="flex items-end">
                <Button onClick={run} loading={running} className="w-full">
                  <PaperPlaneTilt size={15} weight="fill" /> Run paid answer
                </Button>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Try a sample</div>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setQuery(p)}
                    className="text-xs rounded-full border border-zinc-800 px-3 py-1.5 text-zinc-300 hover:border-emerald-400/30 hover:text-emerald-200 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <div className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </div>
            )}
          </div>

          <div className="panel p-5 min-h-[440px]">
            {!result && !running && (
              <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
                <Robot size={32} weight="duotone" className="text-emerald-400 mb-3" />
                <p className="text-sm">Your agent&apos;s answer and decision ledger will appear here.</p>
              </div>
            )}
            {running && (
              <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400">
                <CircleNotch size={28} className="animate-spin text-emerald-300" />
                <p className="mt-3 text-sm">Agent is searching, scoring, and paying…</p>
                <p className="text-xs text-zinc-500 mt-1">Settles on Arc in under a second.</p>
              </div>
            )}
            {result && !running && (
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-3">
                  <span>
                    Run {result.runId.slice(0, 8)} · spent {formatMicroUsdc(result.spentMicroUsdc)} · {result.cacheEvents} cache hit{result.cacheEvents === 1 ? "" : "s"}
                    {result.account && (
                      <> · balance {formatMicroUsdc(result.account.balanceMicroUsdc)}</>
                    )}
                  </span>
                  <span className={`chip ${result.retrieval.status === "answered" ? "chip-accent" : ""}`}>
                    {result.retrieval.status === "no_coverage"
                      ? "No coverage"
                      : result.retrieval.status === "provider_fallback"
                        ? "Fallback composer"
                        : result.reasoningUsed
                          ? "LLM reasoning"
                          : "Answered"}
                  </span>
                </div>
                <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-400">
                  {result.retrieval.message} · {result.retrieval.candidateCount} candidate{result.retrieval.candidateCount === 1 ? "" : "s"} · {result.retrieval.paidCardCount} paid card{result.retrieval.paidCardCount === 1 ? "" : "s"}
                </div>
                <article className="prose prose-invert max-w-none text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {result.answer}
                </article>
                <div className="mt-5">
                  <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">AI reasoning ledger</div>
                  <ul className="divide-y divide-zinc-900 border-t border-b border-zinc-900">
                    {result.ledger.map((row) => (
                      <li key={row.sourceId} className="py-2.5 text-sm flex items-start gap-3">
                        <span
                          className={`mt-1 inline-flex h-2 w-2 rounded-full ${
                            row.action === "paid"
                              ? "bg-emerald-400"
                              : row.action === "cached"
                                ? "bg-amber-400"
                                : "bg-zinc-600"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-zinc-200 truncate">
                            {row.title}{" "}
                            <span className="text-xs text-zinc-500">— {row.publisher}</span>
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5">{row.reason}</div>
                        </div>
                        <div className="text-right">
                          <div className="amount text-zinc-200">{row.price}</div>
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                            {row.action}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                {result.decisions.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Settled receipts</div>
                    <ul className="space-y-1.5 text-xs text-zinc-400">
                      {result.decisions.map((d) => (
                        <li key={d.sourceId} className="flex items-center justify-between gap-3">
                          <span className="truncate">{d.title}</span>
                          <span className="amount text-zinc-500">{d.receipt.slice(0, 18)}…</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
