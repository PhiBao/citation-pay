"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  Copy,
  Key,
  Play,
  Stack,
  Wrench
} from "@phosphor-icons/react/dist/ssr";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

type ToolDef = {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  defaultArgs: Record<string, unknown>;
};

const TOOLS: ToolDef[] = [
  {
    name: "search_sources",
    description: "Search priced publisher sources by free-text query.",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 3, maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 20 }
      },
      required: ["query"]
    },
    defaultArgs: { query: "agent payments on Arc", limit: 5 }
  },
  {
    name: "preview_citation",
    description: "Read a free preview of a priced source (no payment required).",
    schema: {
      type: "object",
      properties: { sourceId: { type: "string", format: "uuid" } },
      required: ["sourceId"]
    },
    defaultArgs: { sourceId: "" }
  },
  {
    name: "answer_with_paid_citations",
    description: "Run the paid-citation agent loop and get a composed answer with cited cards.",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 8, maxLength: 600 },
        budgetUsd: { type: "string", minLength: 1 }
      },
      required: ["query", "budgetUsd"]
    },
    defaultArgs: {
      query: "What is changing in agent-to-agent payments on Arc?",
      budgetUsd: "0.002"
    }
  },
  {
    name: "buy_citations",
    description: "Pay for citations matching a query and return settled receipts only.",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 8, maxLength: 600 },
        budgetUsd: { type: "string" }
      },
      required: ["query", "budgetUsd"]
    },
    defaultArgs: {
      query: "Explain how x402 nanopayments batch authorizations on Arc.",
      budgetUsd: "0.001"
    }
  },
  {
    name: "get_receipts",
    description: "Return recent settled citation receipts for the authenticated account.",
    schema: {
      type: "object",
      properties: {
        runId: { type: "string", format: "uuid" },
        limit: { type: "integer", minimum: 1, maximum: 50 }
      }
    },
    defaultArgs: { limit: 10 }
  },
  {
    name: "list_sources",
    description: "List the priced source market (most recently imported first).",
    schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 40 } }
    },
    defaultArgs: { limit: 12 }
  }
];

export default function McpPage() {
  const router = useRouter();
  const { status, user } = useSession();
  const toast = useToast();
  const [selected, setSelected] = useState<string>(TOOLS[0].name);
  const [argsText, setArgsText] = useState<string>(JSON.stringify(TOOLS[0].defaultArgs, null, 2));
  const [response, setResponse] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "anonymous") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const tool = TOOLS.find((t) => t.name === selected);
    if (tool) setArgsText(JSON.stringify(tool.defaultArgs, null, 2));
    setResponse(null);
    setError(null);
  }, [selected]);

  useEffect(() => {
    if (status !== "authenticated" || !user?.account) return;
    void fetch("/api/account/api-keys", { cache: "no-store" })
      .then((r) => r.json())
      .then(() => {});
  }, [status, user]);

  const tool = useMemo(() => TOOLS.find((t) => t.name === selected), [selected]);

  async function runTool() {
    setRunning(true);
    setError(null);
    setResponse(null);
    try {
      const args = argsText.trim() ? JSON.parse(argsText) : {};
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: { name: selected, arguments: args }
        })
      });
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        const content = json?.result?.content?.[0]?.text;
        if (content) {
          setResponse(content);
        } else if (json?.error) {
          setError(`${json.error.message || "Error"} (${json.error.code || "?"})`);
        } else {
          setResponse(text);
        }
      } catch {
        setResponse(text);
      }
      if (!res.ok) {
        toast.push("error", `MCP responded with HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tool call failed");
    } finally {
      setRunning(false);
    }
  }

  const mcpConfig = `{
  "mcpServers": {
    "citationpay": {
      "type": "http",
      "url": "${typeof window !== "undefined" ? window.location.origin : ""}/api/mcp",
      "headers": {
        "Authorization": "Bearer cp_live_REPLACE_WITH_YOUR_KEY"
      }
    }
  }
}`;

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => toast.push("success", "Copied"));
  }

  async function listTools() {
    setRunning(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/list", params: {} })
      });
      const text = await res.text();
      setResponse(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">MCP server</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Model Context Protocol server over Streamable HTTP — connect any MCP-capable client.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="panel p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-3">
              <Stack size={12} className="text-emerald-400" /> Endpoint
            </div>
            <div className="amount text-sm text-zinc-200 break-all">
              {typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp"}
            </div>
            <div className="mt-4 text-xs uppercase tracking-wider text-zinc-500 mb-2">Connect from Claude Desktop / Cursor / Codex</div>
            <div className="relative">
              <pre className="amount text-xs leading-relaxed text-zinc-200 panel-2 p-4 overflow-x-auto">{mcpConfig}</pre>
              <button
                onClick={() => copy(mcpConfig)}
                className="absolute right-2 top-2 rounded-full border border-zinc-800 px-2 py-1 text-[10px] text-zinc-400 hover:border-emerald-400/30 hover:text-emerald-200"
              >
                <Copy size={11} className="inline" /> Copy
              </button>
            </div>
            <div className="mt-3 text-xs text-zinc-500 flex items-center gap-2">
              <Key size={12} /> Use a key from your <Link href="/app/keys" className="text-emerald-300 hover:underline">API keys</Link> page.
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-3">
              <Wrench size={12} className="text-emerald-400" /> Interactive tester
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {TOOLS.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setSelected(t.name)}
                  className={`text-xs rounded-full border px-3 py-1.5 transition-colors ${
                    selected === t.name
                      ? "bg-emerald-400/10 text-emerald-200 border-emerald-400/30"
                      : "border-zinc-800 text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
            {tool && <p className="text-xs text-zinc-500 mb-3">{tool.description}</p>}
            <Textarea
              label="arguments (JSON)"
              name="args"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              rows={8}
              className="amount"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={runTool} loading={running}>
                <Play size={14} weight="fill" /> tools/call
              </Button>
              <Button variant="ghost" onClick={listTools} loading={running}>
                <Stack size={12} /> tools/list
              </Button>
              <button
                onClick={() => setArgsText(JSON.stringify(tool?.defaultArgs ?? {}, null, 2))}
                className="text-xs text-zinc-400 hover:text-emerald-300"
              >
                Reset to default
              </button>
            </div>
            {error && (
              <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </div>
            )}
            {response && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Response</div>
                <pre className="amount text-xs text-emerald-200 leading-relaxed panel-2 p-4 overflow-x-auto max-h-[420px]">
{response}
                </pre>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

