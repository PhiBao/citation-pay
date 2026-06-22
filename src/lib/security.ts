import { adminToken, isProduction, maxPublicBudgetMicroUsdc } from "@/lib/env";

const agentRunsByIp = new Map<string, number[]>();

export function requireAdmin(request: Request) {
  if (!isProduction()) return null;
  const expected = adminToken();
  if (!expected) {
    return Response.json({ error: "ADMIN_TOKEN is required for production setup endpoints" }, { status: 503 });
  }
  const provided = request.headers.get("x-admin-token") || "";
  if (provided !== expected) {
    return Response.json({ error: "Admin token required" }, { status: 401 });
  }
  return null;
}

export function enforcePublicAgentLimits(request: Request, budgetMicroUsdc: number) {
  const maxBudget = maxPublicBudgetMicroUsdc();
  if (budgetMicroUsdc > maxBudget) {
    return Response.json(
      { error: `Budget exceeds public limit of ${maxBudget} micro USDC` },
      { status: 400 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const recent = (agentRunsByIp.get(ip) || []).filter((time) => time > oneHourAgo);
  if (recent.length >= 5) {
    return Response.json({ error: "Public agent run limit reached. Try again later." }, { status: 429 });
  }
  recent.push(now);
  agentRunsByIp.set(ip, recent);
  return null;
}
