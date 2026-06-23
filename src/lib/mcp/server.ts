import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runCitationAgent } from "@/lib/agent";
import { getStore } from "@/lib/db";
import { type AccountSession } from "@/lib/accounts";
import { parseUsdToMicroUsdc, formatMicroUsdc } from "@/lib/price";

function jsonResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }, null, 2)
      }
    ]
  };
}

export async function buildServerForSession(session: AccountSession) {
  const server = new McpServer(
    {
      name: "citationpay",
      version: "0.2.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.tool(
    "search_sources",
    "Search priced publisher sources by free-text query.",
    {
      query: z.string().min(3).max(200),
      limit: z.number().int().min(1).max(20).optional()
    },
    async ({ query, limit }) => {
      try {
        const store = getStore();
        const results = await store.searchSources(query, limit ?? 10);
        return jsonResult({
          results: results.map((r) => ({
            id: r.id,
            title: r.title,
            publisher: r.publisher.name,
            price: formatMicroUsdc(r.price_micro_usdc),
            excerpt: r.excerpt.slice(0, 240),
            canonicalUrl: r.canonical_url
          }))
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "search failed");
      }
    }
  );

  server.tool(
    "preview_citation",
    "Read a free preview of a priced source (no payment required).",
    {
      sourceId: z.string().uuid()
    },
    async ({ sourceId }) => {
      try {
        const store = getStore();
        const source = await store.getSource(sourceId);
        if (!source) return errorResult("source not found");
        return jsonResult({
          id: source.id,
          title: source.title,
          publisher: source.publisher.name,
          canonicalUrl: source.canonical_url,
          price: formatMicroUsdc(source.price_micro_usdc),
          excerpt: source.excerpt,
          contentHash: source.content_hash
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "preview failed");
      }
    }
  );

  server.tool(
    "buy_citations",
    "Pay for a query by spending the account's USDC balance on priced publisher citations via x402 on Arc.",
    {
      query: z.string().min(8).max(600),
      budgetUsd: z.string().min(1).max(20)
    },
    async ({ query, budgetUsd }) => {
      const micro = parseUsdToMicroUsdc(budgetUsd);
      if (!Number.isFinite(micro)) return errorResult("budgetUsd must be a positive number");
      try {
        const result = await runCitationAgent(query, micro, { session, clientType: "mcp" });
        return jsonResult({
          runId: result.runId,
          answer: result.answer,
          spent: formatMicroUsdc(result.spentMicroUsdc),
          cacheEvents: result.cacheEvents,
          balance: result.account ? formatMicroUsdc(result.account.balanceMicroUsdc) : null,
          decisions: result.decisions
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "buy failed");
      }
    }
  );

  server.tool(
    "answer_with_paid_citations",
    "Run a paid-citation agent loop: search, score, pay, compose an answer with cited cards.",
    {
      query: z.string().min(8).max(600),
      budgetUsd: z.string().min(1).max(20)
    },
    async ({ query, budgetUsd }) => {
      const micro = parseUsdToMicroUsdc(budgetUsd);
      if (!Number.isFinite(micro)) return errorResult("budgetUsd must be a positive number");
      try {
        const result = await runCitationAgent(query, micro, { session, clientType: "mcp" });
        return jsonResult({
          runId: result.runId,
          answer: result.answer,
          spent: formatMicroUsdc(result.spentMicroUsdc),
          cacheEvents: result.cacheEvents,
          balance: result.account ? formatMicroUsdc(result.account.balanceMicroUsdc) : null,
          ledger: result.ledger,
          decisions: result.decisions
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "answer failed");
      }
    }
  );

  server.tool(
    "get_receipts",
    "Return recent settled citation receipts for the authenticated account, optionally filtered by run.",
    {
      runId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(50).optional()
    },
    async ({ runId, limit }) => {
      try {
        const store = getStore();
        const payments = await store.listPaymentsForAccount(session.account.id, limit ?? 20);
        const filtered = runId ? payments.filter((p) => p.run_id === runId) : payments;
        return jsonResult({
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
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "receipts failed");
      }
    }
  );

  server.tool(
    "list_sources",
    "List the priced source market (most recently imported first).",
    {
      limit: z.number().int().min(1).max(40).optional()
    },
    async ({ limit }) => {
      try {
        const store = getStore();
        const sources = await store.listSources();
        const slice = limit ?? 20;
        return jsonResult({
          sources: sources.slice(0, slice).map((s) => ({
            id: s.id,
            title: s.title,
            publisher: s.publisher.name,
            price: formatMicroUsdc(s.price_micro_usdc),
            canonicalUrl: s.canonical_url,
            publishedAt: s.published_at
          }))
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "list failed");
      }
    }
  );

  return server;
}
