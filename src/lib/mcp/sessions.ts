import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AccountSession } from "@/lib/accounts";

export type McpSession = {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  accountId: string;
  createdAt: number;
  lastUsedAt: number;
};

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 200;

const sessions = new Map<string, McpSession>();

export function getSession(id: string): McpSession | null {
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.lastUsedAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  session.lastUsedAt = Date.now();
  return session;
}

export function setSession(id: string, session: McpSession): void {
  if (sessions.size >= MAX_SESSIONS) {
    evictOldest();
  }
  sessions.set(id, session);
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function sessionCount(): number {
  return sessions.size;
}

function evictOldest() {
  let oldestId: string | null = null;
  let oldestTime = Infinity;
  for (const [id, session] of sessions) {
    if (session.lastUsedAt < oldestTime) {
      oldestTime = session.lastUsedAt;
      oldestId = id;
    }
  }
  if (oldestId) sessions.delete(oldestId);
}

export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let removed = 0;
  for (const [id, session] of sessions) {
    if (now - session.lastUsedAt > SESSION_TTL_MS) {
      sessions.delete(id);
      removed++;
    }
  }
  return removed;
}

export type { AccountSession };
