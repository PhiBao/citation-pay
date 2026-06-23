import { z } from "zod";
import { runCitationAgent } from "@/lib/agent";
import { requireAccountSession } from "@/lib/accounts";
import { getStore } from "@/lib/db";
import { parseUsdToMicroUsdc } from "@/lib/price";

const callSchema = z.object({
  jsonrpc: z.literal("2.0").optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z
    .object({
      name: z.string().optional(),
      arguments: z.record(z.unknown()).optional()
    })
    .optional()
});

export async function POST(request: Request) {
  let payload: z.infer<typeof callSchema>;
  try {
    payload = callSchema.parse(await request.json());
  } catch {
    return jsonRpc(null, null, { code: -32700, message: "Invalid JSON-RPC request" });
  }

  try {
    if (payload.method === "initialize") {
      return jsonRpc(payload.id, {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "citationpay", version: "0.1.0" },
        capabilities: { tools: {} }
      });
    }

    if (payload.method === "tools/list") {
      return jsonRpc(payload.id, { tools });
    }

    if (payload.method === "tools/call") {
      const session = await requireAccountSession(request);
      const name = payload.params?.name;
      const args = payload.params?.arguments || {};
      const result = await callTool(name || "", args, session);
      return jsonRpc(payload.id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      });
    }

    return jsonRpc(payload.id, null, { code: -32601, message: `Unknown method ${payload.method}` });
  } catch (error) {
    return jsonRpc(payload.id, null, {
      code: -32000,
      message: error instanceof Error ? error.message : "MCP tool failed"
    });
  }
}

async function callTool(name: string, args: Record<string, unknown>, session: Awaited<ReturnType<typeof requireAccountSession>>) {
  const store = getStore();
  if (name === "citationpay.search_sources") {
    const query = z.string().min(2).parse(args.query);
    const limit = z.coerce.number().int().min(1).max(20).default(8).parse(args.limit ?? 8);
    const sources = await store.searchSources(query, limit);
    return {
      sources: sources.map((source) => ({
        id: source.id,
        title: source.title,
        publisher: source.publisher.name,
        priceMicroUsdc: source.price_micro_usdc,
        publishedAt: source.published_at,
        canonicalUrl: source.canonical_url,
        excerpt: source.excerpt.slice(0, 280)
      }))
    };
  }

  if (name === "citationpay.preview_citation") {
    const sourceId = z.string().uuid().parse(args.sourceId);
    const source = await store.getSource(sourceId);
    if (!source) throw new Error("Source not found");
    return {
      source: {
        id: source.id,
        title: source.title,
        publisher: source.publisher.name,
        priceMicroUsdc: source.price_micro_usdc,
        canonicalUrl: source.canonical_url,
        excerpt: source.excerpt
      }
    };
  }

  if (name === "citationpay.buy_citations" || name === "citationpay.answer_with_paid_citations") {
    const query = z.string().min(8).max(600).parse(args.query);
    const budgetUsd = z.union([z.string(), z.number()]).parse(args.budgetUsd ?? "0.001");
    return runCitationAgent(query, parseUsdToMicroUsdc(budgetUsd), { session, clientType: "mcp" });
  }

  if (name === "citationpay.get_receipts") {
    const dashboard = await store.dashboard();
    const runId = z.string().uuid().optional().parse(args.runId);
    const payments = dashboard.payments.filter((payment) =>
      payment.account_id === session.account.id && (!runId || payment.run_id === runId)
    );
    return {
      receipts: payments.map((payment) => ({
        runId: payment.run_id,
        sourceTitle: payment.source?.title || payment.source_id,
        amountMicroUsdc: payment.amount_micro_usdc,
        network: payment.network,
        transferId: payment.transfer_id,
        status: payment.status
      }))
    };
  }

  throw new Error(`Unknown tool ${name}`);
}

function jsonRpc(id: unknown, result: unknown, error?: { code: number; message: string }) {
  return Response.json({
    jsonrpc: "2.0",
    id: id ?? null,
    ...(error ? { error } : { result })
  });
}

const tools = [
  {
    name: "citationpay.search_sources",
    description: "Search priced publisher sources without spending.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" }
      },
      required: ["query"]
    }
  },
  {
    name: "citationpay.preview_citation",
    description: "Preview one priced citation source without spending.",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: { type: "string" }
      },
      required: ["sourceId"]
    }
  },
  {
    name: "citationpay.buy_citations",
    description: "Buy or reuse paid citations within the account balance and return receipts plus ledger.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        budgetUsd: { type: "string" }
      },
      required: ["query", "budgetUsd"]
    }
  },
  {
    name: "citationpay.answer_with_paid_citations",
    description: "Buy/reuse citations and compose an answer from paid source cards.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        budgetUsd: { type: "string" }
      },
      required: ["query", "budgetUsd"]
    }
  },
  {
    name: "citationpay.get_receipts",
    description: "Return receipts for the authenticated account.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" }
      }
    }
  }
];
