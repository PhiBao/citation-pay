import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireSession } from "@/lib/accounts";
import { buildServerForSession } from "@/lib/mcp/server";
import { getSession, setSession, deleteSession, cleanupExpiredSessions } from "@/lib/mcp/sessions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SESSION_HEADER = "mcp-session-id";

export async function POST(request: Request) {
  validateOrigin(request);
  cleanupExpiredSessions();

  const sessionId = request.headers.get(SESSION_HEADER) || undefined;
  const isInitRequest = await isInitialize(request);

  if (isInitRequest) {
    return handleInitialize(request);
  }

  if (sessionId) {
    const session = getSession(sessionId);
    if (session) {
      return session.transport.handleRequest(request);
    }
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Session not found or expired" } }),
      { status: 404, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request: no valid session. Send initialize first." } }),
    { status: 400, headers: { "content-type": "application/json" } }
  );
}

export async function GET(request: Request) {
  validateOrigin(request);
  const sessionId = request.headers.get(SESSION_HEADER) || undefined;
  if (sessionId) {
    const session = getSession(sessionId);
    if (session) {
      return session.transport.handleRequest(request);
    }
  }
  return new Response("Session not found", { status: 404 });
}

export async function DELETE(request: Request) {
  validateOrigin(request);
  const sessionId = request.headers.get(SESSION_HEADER) || undefined;
  if (sessionId) {
    deleteSession(sessionId);
    return new Response(null, { status: 200 });
  }
  return new Response(null, { status: 404 });
}

async function handleInitialize(request: Request): Promise<Response> {
  let session;
  try {
    session = await requireSession(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication required";
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message } }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const newSessionId = crypto.randomUUID();
  const server = await buildServerForSession(session);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => newSessionId,
    enableJsonResponse: true
  });

  await server.connect(transport);

  const response = await transport.handleRequest(request);

  setSession(newSessionId, {
    server,
    transport,
    accountId: session.account.id,
    createdAt: Date.now(),
    lastUsedAt: Date.now()
  });

  const headers = new Headers(response.headers);
  headers.set(SESSION_HEADER, newSessionId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function validateOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        throw new Error("Origin validation failed");
      }
    } catch {
      throw new Error("Invalid origin");
    }
  }
}

async function isInitialize(request: Request): Promise<boolean> {
  try {
    const cloned = request.clone();
    const body = (await cloned.json()) as Record<string, unknown>;
    return body.method === "initialize";
  } catch {
    return false;
  }
}
