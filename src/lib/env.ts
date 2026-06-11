export const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";

export const paymentMode = () =>
  process.env.PAYMENT_MODE === "real" ? "real" : "mock";

export const arcNetwork = () => process.env.ARC_TESTNET_NETWORK || "eip155:5042002";

export const facilitatorUrl = () =>
  process.env.CIRCLE_FACILITATOR_URL || "https://gateway-api-testnet.circle.com";

export const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const requireRealPaymentEnv = () => {
  const missing = ["BUYER_PRIVATE_KEY", "BUYER_ADDRESS"].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing real payment env: ${missing.join(", ")}`);
  }
};
