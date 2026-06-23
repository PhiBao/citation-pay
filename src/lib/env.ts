export const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";

export const paymentMode = () =>
  process.env.PAYMENT_MODE === "real" ? "real" : "mock";

export const arcNetwork = () => process.env.ARC_TESTNET_NETWORK || "eip155:5042002";

export const facilitatorUrl = () =>
  process.env.CIRCLE_FACILITATOR_URL || "https://gateway-api-testnet.circle.com";

export const arcRpcUrl = () => process.env.ARC_RPC_URL || "";

export const hasCircleWalletApiEnv = () =>
  Boolean(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_WALLET_ID);

export const dgridBaseUrl = () => (process.env.DGRID_BASE_URL || "https://api.dgrid.ai/v1").replace(/\/$/, "");

export const dgridModel = () => process.env.DGRID_MODEL || "openai/gpt-4o";

export const hasDgridEnv = () => Boolean(process.env.DGRID_API_KEY);

export const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const isProduction = () => process.env.NODE_ENV === "production";

export const adminToken = () => process.env.ADMIN_TOKEN || "";

export const maxPublicBudgetMicroUsdc = () => {
  const raw = Number(process.env.MAX_PUBLIC_BUDGET_MICRO_USDC || "1000");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1000;
};

export const requireRealPaymentEnv = () => {
  const missing = ["BUYER_PRIVATE_KEY", "BUYER_ADDRESS"].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing real payment env: ${missing.join(", ")}`);
  }
};
