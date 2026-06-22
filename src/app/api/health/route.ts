import { appUrl, arcRpcUrl, facilitatorUrl, hasCircleWalletApiEnv, hasSupabaseEnv, paymentMode } from "@/lib/env";
import { getStore } from "@/lib/db";

export async function GET() {
  const startedAt = Date.now();
  const [database, facilitator] = await Promise.all([checkDatabase(), checkFacilitator()]);

  return Response.json({
    ok: database.ok,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    appUrl: appUrl(),
    paymentMode: paymentMode(),
    supabaseConfigured: hasSupabaseEnv(),
    circleWalletApiConfigured: hasCircleWalletApiEnv(),
    arcRpcConfigured: Boolean(arcRpcUrl()),
    database,
    facilitator
  });
}

async function checkDatabase() {
  if (!hasSupabaseEnv()) return { ok: true, mode: "json-fallback", error: null };
  try {
    const dashboard = await getStore().dashboard();
    return {
      ok: true,
      mode: "supabase",
      publishers: dashboard.publishers.length,
      sources: dashboard.sources.length,
      payments: dashboard.payments.length,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      mode: "supabase",
      error: error instanceof Error ? error.message : "Database check failed"
    };
  }
}

async function checkFacilitator() {
  try {
    const response = await fetch(facilitatorUrl(), {
      method: "HEAD",
      signal: AbortSignal.timeout(4000)
    });
    return {
      ok: response.status < 500,
      status: response.status,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "Facilitator check failed"
    };
  }
}
