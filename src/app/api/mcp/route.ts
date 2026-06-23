import { requireSession } from "@/lib/accounts";
import { dispatchTool, toolSchemas } from "@/lib/mcp/dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return new Response("Origin validation failed", { status: 403 });
      }
    } catch {
      return new Response("Invalid origin", { status: 400 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return rpcError(-32700, "Parse error");
  }

  if (body.jsonrpc !== "2.0") {
    return rpcError(-32600, "Invalid Request");
  }

  const id = (body.id ?? null) as string | number | null;
  const method = typeof body.method === "string" ? body.method : "";

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "citationpay", version: "0.2.0" }
    });
  }

  if (method === "notifications/initialized") {
    return Response.json({ jsonrpc: "2.0", id, result: {} });
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: toolSchemas });
  }

  if (method === "tools/call") {
    const params = (body.params || {}) as { name?: string; arguments?: Record<string, unknown> };
    const toolName = params.name;
    if (!toolName) return rpcError(-32602, "Missing tool name", id);

    let accountId: string;
    try {
      const session = await requireSession(request);
      accountId = session.account.id;
    } catch (err) {
      return rpcError(-32000, err instanceof Error ? err.message : "Authentication required", id);
    }

    try {
      const result = await dispatchTool(toolName, params.arguments || {}, accountId);
      return rpcResult(id, result);
    } catch (err) {
      return rpcError(-32000, err instanceof Error ? err.message : "Tool execution failed", id);
    }
  }

  return rpcError(-32601, `Method not found: ${method}`, id);
}

export async function GET() {
  return new Response("POST JSON-RPC 2.0 to this endpoint.", { status: 405 });
}

export async function DELETE() {
  return new Response(null, { status: 405 });
}

function rpcResult(id: string | number | null, result: unknown) {
  return Response.json(
    { jsonrpc: "2.0", id, result },
    { headers: { "content-type": "application/json" } }
  );
}

function rpcError(code: number, message: string, id: string | number | null = null) {
  return Response.json(
    { jsonrpc: "2.0", error: { code, message }, id },
    { status: code === -32000 ? 500 : 400, headers: { "content-type": "application/json" } }
  );
}
