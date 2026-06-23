"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { DashboardData } from "@/lib/types";
import { formatMicroUsdc } from "@/lib/price";

type DashboardResponse = DashboardData & {
  paymentMode: "real" | "mock";
  health?: { database: "ok" | "down"; error: string | null };
};

type AccountView = {
  id: string;
  name: string;
  email: string;
  balanceMicroUsdc: number;
  perRunLimitMicroUsdc: number;
  dailyLimitMicroUsdc: number;
};

type AgentResponse = {
  runId: string;
  answer: string;
  spentMicroUsdc: number;
  cacheEvents: number;
  account?: { id: string; balanceMicroUsdc: number };
  ledger: Array<{
    sourceId: string;
    title: string;
    publisher: string;
    action: "paid" | "cached" | "skipped";
    score: number;
    price: string;
    reason: string;
  }>;
};

const emptyDashboard: DashboardResponse = {
  accounts: [],
  publishers: [],
  feeds: [],
  sources: [],
  runs: [],
  payments: [],
  decisions: [],
  cache: [],
  paymentMode: "mock",
  health: { database: "ok", error: null }
};

export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardResponse>(emptyDashboard);
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [account, setAccount] = useState<AccountView | null>(null);
  const [agentResult, setAgentResult] = useState<AgentResponse | null>(null);

  async function refresh() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const data = (await response.json()) as DashboardResponse;
    setDashboard(data);
  }

  useEffect(() => {
    const savedKey = window.localStorage.getItem("citationpay_api_key") || "";
    setApiKey(savedKey);
    refresh().catch((error) => setStatus(errorMessage(error)));
    if (savedKey) {
      fetch("/api/account", {
        headers: { Authorization: `Bearer ${savedKey}` }
      })
        .then((response) => expectOk<{ account: AccountView }>(response))
        .then((data) => setAccount(data.account))
        .catch(() => window.localStorage.removeItem("citationpay_api_key"));
    }
  }, []);

  const totalPaid = useMemo(
    () => dashboard.payments.reduce((sum, payment) => sum + payment.amount_micro_usdc, 0),
    [dashboard.payments]
  );

  async function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/accounts/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email")
        })
      });
      const data = await expectOk<{ account: AccountView; apiKey: { key: string } }>(response);
      setApiKey(data.apiKey.key);
      setAccount(data.account);
      window.localStorage.setItem("citationpay_api_key", data.apiKey.key);
      setStatus("Account ready. Your API key is saved in this browser.");
      await refresh();
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function runAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setAgentResult(null);
    const form = new FormData(event.currentTarget);
    try {
      if (!apiKey) throw new Error("Create an account first");
      const response = await fetch("/api/agent/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          query: form.get("query"),
          budgetUsd: form.get("budgetUsd")
        })
      });
      const data = await expectOk<AgentResponse>(response);
      setAgentResult(data);
      if (data.account && account) {
        setAccount({ ...account, balanceMicroUsdc: data.account.balanceMicroUsdc });
      }
      setStatus(`Run complete. Spent ${formatMicroUsdc(data.spentMicroUsdc)}.`);
      await refresh();
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-6 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Paid citation accounts for agents</p>
            <h1 className="mt-2 text-4xl font-black leading-none md:text-6xl">CitationPay</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted)]">
              Create an account, get trial USDC credit, and let your agent buy publisher citations through x402. No private keys in the browser, no anonymous platform spending.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="mode" value={dashboard.paymentMode} tone={dashboard.paymentMode === "real" ? "good" : "warn"} />
            <Metric label="accounts" value={String(dashboard.accounts.length)} />
            <Metric label="sources" value={String(dashboard.sources.length)} />
            <Metric label="paid" value={formatMicroUsdc(totalPaid)} />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:px-8 xl:grid-cols-[0.9fr_1.1fr]">
        <aside className="space-y-5">
          <Panel title="1. Create Account" kicker="Self serve">
            {account ? (
              <div className="grid gap-3">
                <ProofRow label="Account" value={account.email} />
                <ProofRow label="Balance" value={formatMicroUsdc(account.balanceMicroUsdc)} tone={account.balanceMicroUsdc > 0 ? "good" : "warn"} />
                <ProofRow label="Per-run limit" value={formatMicroUsdc(account.perRunLimitMicroUsdc)} />
              </div>
            ) : (
              <form className="grid gap-3" onSubmit={signup}>
                <Input name="name" label="Name" placeholder="Kiter" required />
                <Input name="email" type="email" label="Email" placeholder="you@example.com" required />
                <button className="rounded-md bg-[var(--ink)] px-4 py-3 font-bold text-white disabled:opacity-50" disabled={loading}>
                  Create account and API key
                </button>
              </form>
            )}
          </Panel>

          <Panel title="2. Connect Agent" kicker="MCP/API">
            <div className="grid gap-3 text-sm">
              <CodeBlock value={`POST ${typeof window === "undefined" ? "" : window.location.origin}/api/mcp`} />
              <CodeBlock value={`Authorization: Bearer ${apiKey || "cp_live_..."}`} />
              <p className="text-[var(--muted)]">
                Tools: search sources, preview citation, buy citations, answer with paid citations, get receipts.
              </p>
            </div>
          </Panel>

          <Panel title="Live Proof" kicker="Receipts">
            <div className="grid gap-3">
              <ProofRow label="Database" value={dashboard.health?.database === "down" ? "degraded" : "reachable"} tone={dashboard.health?.database === "down" ? "warn" : "good"} />
              <ProofRow label="Publisher sources" value={String(dashboard.sources.length)} />
              <ProofRow label="Settled payments" value={String(dashboard.payments.length)} />
              <ProofRow label="Source cache" value={`${dashboard.cache.length} cards`} />
            </div>
          </Panel>
        </aside>

        <div className="space-y-5">
          <Panel title="3. Run Paid Answer" kicker="User balance">
            <form className="grid gap-3" onSubmit={runAgent}>
              <label className="block text-sm font-bold text-[var(--muted)]">
                Research request
                <textarea
                  name="query"
                  className="mt-1 min-h-36 w-full resize-y rounded-md border border-[var(--line)] bg-white px-3 py-3 text-[var(--foreground)]"
                  defaultValue="What is changing in agent payments, nanopayments, and publisher monetization?"
                  required
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input name="budgetUsd" label="Max spend in USDC" defaultValue="0.001" required />
                <button className="self-end rounded-md bg-[var(--accent)] px-5 py-3 font-bold text-white disabled:opacity-50" disabled={loading || !apiKey || dashboard.sources.length === 0}>
                  {loading ? "Running..." : "Buy citations and answer"}
                </button>
              </div>
            </form>

            {agentResult ? (
              <div className="mt-5 grid gap-4">
                <div className="rounded-md border border-[var(--line)] bg-[#fffdf7] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black">Paid Answer</h3>
                    <span className="text-sm font-bold text-[var(--accent)]">
                      {formatMicroUsdc(agentResult.spentMicroUsdc)} spent · {agentResult.cacheEvents} cache hits
                    </span>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">{agentResult.answer}</pre>
                </div>
                <DecisionLedger rows={agentResult.ledger} />
              </div>
            ) : (
              <Empty text={apiKey ? "Run the agent to buy or reuse paid citations." : "Create an account first. Paid runs require an account balance and API key."} />
            )}
          </Panel>

          <Panel title="Source Market" kicker="Priced feeds">
            <div className="grid gap-3">
              {dashboard.sources.slice(0, 8).map((source) => (
                <div key={source.id} className="rounded-md border border-[var(--line)] bg-white p-3">
                  <div className="text-sm font-black">{source.title}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {source.publisher.name} · {formatMicroUsdc(source.price_micro_usdc)}
                  </div>
                </div>
              ))}
              {dashboard.sources.length === 0 && <Empty text="No priced sources are imported yet." />}
            </div>
          </Panel>
        </div>
      </section>

      <div className="fixed bottom-4 left-1/2 z-10 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-md border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-lg">
        <span className="font-bold">Status:</span> {loading ? "Working..." : status}
      </div>
    </main>
  );
}

function Panel({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">{title}</h2>
        <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-[var(--accent)]">
          {kicker}
        </span>
      </div>
      {children}
    </section>
  );
}

function DecisionLedger({ rows }: { rows: AgentResponse["ledger"] }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-white">
      <div className="border-b border-[var(--line)] px-3 py-2 font-black">Agent Decision Ledger</div>
      <div className="divide-y divide-[var(--line)]">
        {rows.map((row) => (
          <div key={`${row.sourceId}-${row.action}`} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[90px_1fr_70px]">
            <span className={`w-fit rounded-full px-2 py-1 text-xs font-black uppercase ${actionClass(row.action)}`}>{row.action}</span>
            <div>
              <div className="font-bold">{row.title}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{row.publisher} · {row.price} · {row.reason}</div>
            </div>
            <div className="text-right font-black">{row.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <div className={`rounded-md border px-3 py-3 text-center ${toneClass(tone)}`}>
      <div className="break-words text-lg font-black">{value}</div>
      <div className="text-xs font-bold uppercase tracking-[0.14em] opacity-75">{label}</div>
    </div>
  );
}

function ProofRow({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-white p-3 text-sm">
      <span className="font-bold text-[var(--muted)]">{label}</span>
      <span className={`break-all text-right font-black ${tone === "good" ? "text-[#0d6b47]" : tone === "warn" ? "text-[#9a5b00]" : ""}`}>{value}</span>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  return <code className="block overflow-x-auto rounded-md border border-[var(--line)] bg-white p-3 text-xs">{value}</code>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <label className="block text-sm font-bold text-[var(--muted)]">
      {label}
      <input
        {...inputProps}
        className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-3 text-[var(--foreground)] placeholder:text-[#8a867c]"
      />
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="mt-4 rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">{text}</div>;
}

function actionClass(action: "paid" | "cached" | "skipped") {
  if (action === "paid") return "bg-[#e4f8ee] text-[#0d6b47]";
  if (action === "cached") return "bg-[#e9edff] text-[#3140a0]";
  return "bg-[#f4efe5] text-[#76664d]";
}

function toneClass(tone: "neutral" | "good" | "warn") {
  if (tone === "good") return "border-[#9dd8bd] bg-[#eaf8f0] text-[#0d6b47]";
  if (tone === "warn") return "border-[#e2b45c] bg-[#fff6df] text-[#68440b]";
  return "border-[var(--line)] bg-white text-[var(--foreground)]";
}

async function expectOk<T = unknown>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  }
  return data as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something failed";
}
