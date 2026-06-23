import { runCitationAgent } from "@/lib/agent";
import { getStore } from "@/lib/db";
import { parseUsdToMicroUsdc, formatMicroUsdc } from "@/lib/price";
import type { AccountSession } from "@/lib/accounts";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

export const toolSchemas = [
  {
    name: "search_sources",
    description: "Search priced publisher sources by free-text query.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, minLength: 3, maxLength: 200 },
        limit: { type: "integer" as const, minimum: 1, maximum: 20 }
      },
      required: ["query"]
    }
  },
  {
    name: "preview_citation",
    description: "Read a free preview of a priced source (no payment required).",
    inputSchema: {
      type: "object" as const,
      properties: { sourceId: { type: "string" as const, format: "uuid" } },
      required: ["sourceId"]
    }
  },
  {
    name: "buy_citations",
    description: "Pay for citations by spending the account's USDC balance via x402 on Arc.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, minLength: 8, maxLength: 600 },
        budgetUsd: { type: "string" as const }
      },
      required: ["query", "budgetUsd"]
    }
  },
  {
    name: "answer_with_paid_citations",
    description: "Run the paid-citation agent loop: search, score, pay, compose answer.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, minLength: 8, maxLength: 600 },
        budgetUsd: { type: "string" as const }
      },
      required: ["query", "budgetUsd"]
    }
  },
  {
    name: "get_receipts",
    description: "Return recent settled citation receipts for the account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        runId: { type: "string" as const, format: "uuid" },
        limit: { type: "integer" as const, minimum: 1, maximum: 50 }
      }
    }
  },
  {
    name: "list_sources",
    description: "List the priced source market.",
    inputSchema: {
      type: "object" as const,
      properties: { limit: { type: "integer" as const, minimum: 1, maximum: 40 } }
    }
  }
];

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  accountId: string
): Promise<ToolResult> {
  const store = getStore();
  try {
    switch (name) {
      case "search_sources": {
        const query = String(args.query || "");
        const limit = Math.min(Number(args.limit || 10) || 10, 20);
        const results = await store.searchSources(query, limit);
        return ok({
          results: results.map((r) => ({
            id: r.id,
            title: r.title,
            publisher: r.publisher.name,
            price: formatMicroUsdc(r.price_micro_usdc),
            excerpt: r.excerpt.slice(0, 240),
            canonicalUrl: r.canonical_url
          }))
        });
      }
      case "preview_citation": {
        const source = await store.getSource(String(args.sourceId || ""));
        if (!source) return err("source not found");
        return ok({
          id: source.id,
          title: source.title,
          publisher: source.publisher.name,
          canonicalUrl: source.canonical_url,
          price: formatMicroUsdc(source.price_micro_usdc),
          excerpt: source.excerpt,
          contentHash: source.content_hash
        });
      }
      case "buy_citations":
      case "answer_with_paid_citations": {
        const micro = parseUsdToMicroUsdc(String(args.budgetUsd || "0"));
        if (!Number.isFinite(micro)) return err("budgetUsd must be a positive number");
        const session = await getAccountSession(store, accountId);
        const result = await runCitationAgent(String(args.query || ""), micro, { session, clientType: "mcp" });
        return ok({
          runId: result.runId,
          answer: result.answer,
          spent: formatMicroUsdc(result.spentMicroUsdc),
          cacheEvents: result.cacheEvents,
          reasoningUsed: result.reasoningUsed,
          balance: result.account ? formatMicroUsdc(result.account.balanceMicroUsdc) : null,
          ledger: result.ledger,
          decisions: result.decisions
        });
      }
      case "get_receipts": {
        const runId = typeof args.runId === "string" ? args.runId : undefined;
        const limit = Math.min(Number(args.limit || 20) || 20, 50);
        const payments = await store.listPaymentsForAccount(accountId, limit);
        const filtered = runId ? payments.filter((p) => p.run_id === runId) : payments;
        return ok({
          receipts: filtered.map((p) => ({
            id: p.id,
            amount: formatMicroUsdc(p.amount_micro_usdc),
            network: p.network,
            status: p.status,
            transferId: p.transfer_id,
            title: p.source?.title,
            publisher: p.source?.publisher.name,
            canonicalUrl: p.source?.canonical_url,
            createdAt: p.created_at
          }))
        });
      }
      case "list_sources": {
        const limit = Math.min(Number(args.limit || 20) || 20, 40);
        const sources = await store.listSources();
        return ok({
          sources: sources.slice(0, limit).map((s) => ({
            id: s.id,
            title: s.title,
            publisher: s.publisher.name,
            price: formatMicroUsdc(s.price_micro_usdc),
            canonicalUrl: s.canonical_url,
            publishedAt: s.published_at
          }))
        });
      }
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return err(error instanceof Error ? error.message : "Tool execution failed");
  }
}

async function getAccountSession(store: ReturnType<typeof getStore>, accountId: string): Promise<AccountSession> {
  const account = await store.getAccount(accountId);
  if (!account || account.status !== "active") throw new Error("Account not found or disabled");
  const apiKeys = await store.listAccountApiKeys(accountId);
  const apiKey = apiKeys.find((k) => k.name === "Default agent key") || apiKeys[0];
  if (!apiKey) throw new Error("No API key found");
  return { account, apiKey };
}
