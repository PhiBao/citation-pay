"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { DashboardData } from "@/lib/types";
import { formatMicroUsdc } from "@/lib/price";

type HealthState = {
  database: "ok" | "down";
  error: string | null;
};

type DashboardResponse = DashboardData & {
  paymentMode: "real" | "mock";
  health?: HealthState;
};

type AgentResponse = {
  runId: string;
  answer: string;
  spentMicroUsdc: number;
  cacheEvents: number;
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

const emptyDashboard: DashboardResponse = {
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
  const [agentResult, setAgentResult] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminToken, setAdminToken] = useState("");

  async function refresh() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const data = (await response.json()) as DashboardResponse;
    setDashboard(data);
    if (data.health?.database === "down") {
      setStatus(`Database degraded: ${data.health.error}`);
    }
  }

  useEffect(() => {
    refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Dashboard failed"));
  }, []);

  const latestPublisher = dashboard.publishers[0];
  const latestRun = dashboard.runs[0];
  const latestPayment = dashboard.payments[0];
  const totalPaid = useMemo(
    () => dashboard.payments.reduce((sum, payment) => sum + payment.amount_micro_usdc, 0),
    [dashboard.payments]
  );
  const uniquePublishersPaid = useMemo(
    () => new Set(dashboard.payments.map((payment) => payment.seller_wallet.toLowerCase())).size,
    [dashboard.payments]
  );

  async function createPublisher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/publishers", {
        method: "POST",
        headers: setupHeaders(adminToken),
        body: JSON.stringify({
          name: form.get("name"),
          walletAddress: form.get("walletAddress"),
          defaultPriceUsd: form.get("defaultPriceUsd")
        })
      });
      await expectOk(response);
      event.currentTarget.reset();
      setStatus("Publisher created");
      await refresh();
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function importFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/feeds/import", {
        method: "POST",
        headers: setupHeaders(adminToken),
        body: JSON.stringify({
          publisherId: form.get("publisherId"),
          url: form.get("url")
        })
      });
      const data = await expectOk<{ imported: number }>(response);
      setStatus(`Imported ${data.imported} sources`);
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
      const response = await fetch("/api/agent/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: form.get("query"),
          budgetUsd: form.get("budgetUsd")
        })
      });
      const data = await expectOk<AgentResponse>(response);
      setAgentResult(data);
      setStatus(`Agent spent ${formatMicroUsdc(data.spentMicroUsdc)} across ${data.decisions.length} citations`);
      await refresh();
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="border-b border-[var(--line)] bg-[var(--surface)] px-4 py-5 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Lepton Agents Hackathon</p>
            <h1 className="mt-2 text-4xl font-black leading-none md:text-6xl">CitationPay</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted)]">
              A citation toll layer where an autonomous research agent searches publisher feeds, decides which sources deserve payment, pays through x402 on Arc Testnet, and returns an answer with receipts.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="mode" value={dashboard.paymentMode} tone={dashboard.paymentMode === "real" ? "good" : "warn"} />
            <Metric label="sources" value={String(dashboard.sources.length)} />
            <Metric label="paid" value={String(dashboard.payments.length)} />
            <Metric label="earned" value={formatMicroUsdc(totalPaid)} />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:px-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <Panel title="Agent Workbench" kicker="Public run">
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
                <Input name="budgetUsd" label="Agent citation budget in USDC" defaultValue="0.001" required />
                <button className="self-end rounded-md bg-[var(--ink)] px-5 py-3 font-bold text-white disabled:opacity-50" disabled={loading || dashboard.sources.length === 0}>
                  {loading ? "Agent running..." : "Run paying agent"}
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
              <Empty text={dashboard.sources.length === 0 ? "Seed publisher feeds first, then the public agent can run from this workbench." : "Run the agent to see paid citations, skipped candidates, and receipts."} />
            )}
          </Panel>

          <Panel title="Payment Receipts" kicker="Arc proof">
            <div className="grid gap-3">
              {dashboard.payments.length === 0 && <Empty text="Settled citation payments will appear here after an agent run." />}
              {dashboard.payments.slice(0, 8).map((payment) => (
                <div key={payment.id} className="rounded-md border border-[var(--line)] bg-white p-3 text-sm">
                  <div className="font-black">{payment.source?.title || payment.source_id}</div>
                  <div className="mt-1 break-all text-xs text-[var(--muted)]">
                    {formatMicroUsdc(payment.amount_micro_usdc)} · {payment.status} · {payment.network} · {payment.transfer_id}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel title="Live Proof" kicker="Judge rail">
            <div className="grid gap-3">
              <ProofRow label="Database" value={dashboard.health?.database === "down" ? "degraded" : "reachable"} tone={dashboard.health?.database === "down" ? "warn" : "good"} />
              <ProofRow label="Latest run" value={latestRun ? `${latestRun.status} · ${formatMicroUsdc(latestRun.spent_micro_usdc)}` : "none yet"} />
              <ProofRow label="Latest receipt" value={latestPayment ? `${latestPayment.status} · ${shorten(latestPayment.transfer_id)}` : "none yet"} />
              <ProofRow label="Publishers paid" value={String(uniquePublishersPaid)} />
              <ProofRow label="Source cache" value={`${dashboard.cache.length} paid cards`} />
              {dashboard.health?.error && <div className="rounded-md border border-[#e2b45c] bg-[#fff6df] p-3 text-sm text-[#68440b]">{dashboard.health.error}</div>}
            </div>
          </Panel>

          <Panel title="Source Market" kicker="Priced feeds">
            <div className="grid gap-3">
              {dashboard.sources.length === 0 && <Empty text="No priced sources imported yet." />}
              {dashboard.sources.slice(0, 10).map((source) => (
                <div key={source.id} className="rounded-md border border-[var(--line)] bg-white p-3">
                  <div className="text-sm font-black">{source.title}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {source.publisher.name} · {formatMicroUsdc(source.price_micro_usdc)}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Publisher Setup" kicker="Admin">
            <div className="mb-3">
              <Input
                name="adminToken"
                label="Admin token for production setup"
                value={adminToken}
                onChange={(event) => setAdminToken(event.currentTarget.value)}
                placeholder="Only needed on deployed app"
              />
            </div>
            <form className="space-y-3" onSubmit={createPublisher}>
              <Input name="name" label="Publisher name" placeholder="Arc Daily" required />
              <Input name="walletAddress" label="Receiving wallet" placeholder="0x..." required />
              <Input name="defaultPriceUsd" label="Citation price in USDC" placeholder="0.0001" defaultValue="0.0001" required />
              <button className="w-full rounded-md bg-[var(--ink)] px-4 py-3 font-bold text-white disabled:opacity-50" disabled={loading}>
                Add publisher
              </button>
            </form>

            <form className="mt-4 space-y-3" onSubmit={importFeed}>
              <label className="block text-sm font-bold text-[var(--muted)]">
                Publisher
                <select
                  name="publisherId"
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-3 text-[var(--foreground)]"
                  defaultValue={latestPublisher?.id || ""}
                  required
                >
                  <option value="" disabled>
                    Select publisher
                  </option>
                  {dashboard.publishers.map((publisher) => (
                    <option key={publisher.id} value={publisher.id}>
                      {publisher.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                name="url"
                label="RSS or Atom URL"
                placeholder="https://example.com/feed.xml"
                defaultValue="https://blog.ethereum.org/feed.xml"
                required
              />
              <button className="w-full rounded-md bg-[var(--accent)] px-4 py-3 font-bold text-white disabled:opacity-50" disabled={loading}>
                Import feed
              </button>
            </form>
          </Panel>
        </aside>
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
      <span className={`text-right font-black ${tone === "good" ? "text-[#0d6b47]" : tone === "warn" ? "text-[#9a5b00]" : ""}`}>{value}</span>
    </div>
  );
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

function setupHeaders(token: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-admin-token"] = token;
  return headers;
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

function shorten(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
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
