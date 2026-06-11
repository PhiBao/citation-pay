"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { DashboardData } from "@/lib/types";
import { formatMicroUsdc } from "@/lib/price";

type DashboardResponse = DashboardData & { paymentMode: "real" | "mock" };

type AgentResponse = {
  runId: string;
  answer: string;
  spentMicroUsdc: number;
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
  paymentMode: "mock"
};

export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardResponse>(emptyDashboard);
  const [status, setStatus] = useState("Ready");
  const [agentResult, setAgentResult] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const data = (await response.json()) as DashboardResponse;
    setDashboard(data);
  }

  useEffect(() => {
    refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Dashboard failed"));
  }, []);

  const latestPublisher = dashboard.publishers[0];
  const totalPaid = useMemo(
    () => dashboard.payments.reduce((sum, payment) => sum + payment.amount_micro_usdc, 0),
    [dashboard.payments]
  );

  async function createPublisher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/publishers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
    <main className="grain min-h-screen px-4 py-5 text-[var(--foreground)] md:px-8">
      <section className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--coin-dark)]">Lepton Agents Hackathon</p>
            <h1 className="mt-2 text-4xl font-black leading-none md:text-6xl">CitationPay</h1>
            <p className="mt-3 max-w-2xl text-base text-[var(--muted)]">
              An autonomous research agent spends its own Arc Testnet Gateway USDC budget to pay publishers every time their work is cited.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="mode" value={dashboard.paymentMode} />
            <Metric label="sources" value={String(dashboard.sources.length)} />
            <Metric label="earned" value={formatMicroUsdc(totalPaid)} />
          </div>
        </header>

        <div className="rounded-md border border-[var(--line)] bg-white/55 px-4 py-3 text-sm text-[var(--muted)]">
          <span className="font-bold text-[var(--foreground)]">Status:</span> {loading ? "Working..." : status}
        </div>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-5">
            <Panel title="1. Add publisher" kicker="Creator wallet">
              <form className="space-y-3" onSubmit={createPublisher}>
                <Input name="name" label="Publisher name" placeholder="Arc Daily" required />
                <Input name="walletAddress" label="Receiving wallet" placeholder="0x..." required />
                <Input name="defaultPriceUsd" label="Citation price in USDC" placeholder="0.0001" defaultValue="0.0001" required />
                <button className="w-full rounded-md bg-[var(--ink)] px-4 py-3 font-bold text-white disabled:opacity-50" disabled={loading}>
                  Create publisher
                </button>
              </form>
            </Panel>

            <Panel title="2. Import RSS" kicker="Source graph">
              <form className="space-y-3" onSubmit={importFeed}>
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
                <button className="w-full rounded-md bg-[var(--coin)] px-4 py-3 font-bold text-white disabled:opacity-50" disabled={loading}>
                  Import feed
                </button>
              </form>
            </Panel>
          </div>

          <Panel title="3. Run paying agent" kicker="Budgeted citations">
            <form className="grid gap-3" onSubmit={runAgent}>
              <label className="block text-sm font-bold text-[var(--muted)]">
                Research question
                <textarea
                  name="query"
                  className="mt-1 min-h-32 w-full resize-y rounded-md border border-[var(--line)] bg-white px-3 py-3 text-[var(--foreground)]"
                  defaultValue="What is Circle building for agent payments and nanopayments?"
                  required
                />
              </label>
              <Input name="budgetUsd" label="Agent citation budget in USDC" defaultValue="0.001" required />
              <button className="rounded-md bg-[var(--ink)] px-4 py-3 font-bold text-white disabled:opacity-50" disabled={loading || dashboard.sources.length === 0}>
                Agent pays citations and answers
              </button>
            </form>

            {agentResult && (
              <div className="mt-5 space-y-4">
                <div className="rounded-md border border-[var(--line)] bg-[#fffaf0] p-4">
                  <h3 className="font-black">Agent answer</h3>
                  <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">{agentResult.answer}</pre>
                </div>
                <div className="grid gap-2">
                  {agentResult.decisions.map((decision) => (
                    <div key={`${decision.sourceId}-${decision.receipt}`} className="rounded-md border border-[var(--line)] bg-white/70 p-3 text-sm">
                      <div className="font-bold">{decision.title}</div>
                      <div className="text-[var(--muted)]">
                        {decision.publisher} · {decision.price} · {decision.receipt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Indexed sources" kicker="Recent">
            <div className="space-y-3">
              {dashboard.sources.length === 0 && <Empty text="Import an RSS feed to create priced citation sources." />}
              {dashboard.sources.slice(0, 8).map((source) => (
                <div key={source.id} className="rounded-md border border-[var(--line)] bg-white/65 p-3">
                  <div className="text-sm font-black">{source.title}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {source.publisher.name} · {formatMicroUsdc(source.price_micro_usdc)}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Payment receipts" kicker="Settlement log">
            <div className="space-y-3">
              {dashboard.payments.length === 0 && <Empty text="Paid citations will show here after an agent run." />}
              {dashboard.payments.slice(0, 10).map((payment) => (
                <div key={payment.id} className="rounded-md border border-[var(--line)] bg-white/65 p-3">
                  <div className="text-sm font-black">{payment.source?.title || payment.source_id}</div>
                  <div className="mt-1 break-all text-xs text-[var(--muted)]">
                    {formatMicroUsdc(payment.amount_micro_usdc)} · {payment.status} · {payment.network} · {payment.transfer_id}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      </section>
    </main>
  );
}

function Panel({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-[var(--line)] bg-white/45 p-4 shadow-sm backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">{title}</h2>
        <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-[var(--coin-dark)]">
          {kicker}
        </span>
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-md border border-[var(--line)] bg-white/55 px-3 py-3">
      <div className="text-lg font-black">{value}</div>
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</div>
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
        className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-3 text-[var(--foreground)] placeholder:text-[#a99b80]"
      />
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">{text}</div>;
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
