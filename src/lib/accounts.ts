import { getStore } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { formatMicroUsdc } from "@/lib/price";
import type { Account, AccountApiKey, AgentRun } from "@/lib/types";

export type AccountSession = {
  account: Account;
  apiKey: AccountApiKey;
};

const API_KEY_PREFIX = "cp_live_";

export function trialCreditMicroUsdc() {
  const raw = Number(process.env.TRIAL_CREDIT_MICRO_USDC || "1000");
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 1000;
}

export function defaultPerRunLimitMicroUsdc() {
  const raw = Number(process.env.DEFAULT_PER_RUN_LIMIT_MICRO_USDC || process.env.MAX_PUBLIC_BUDGET_MICRO_USDC || "1000");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1000;
}

export function defaultDailyLimitMicroUsdc() {
  const raw = Number(process.env.DEFAULT_DAILY_LIMIT_MICRO_USDC || "10000");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10000;
}

export async function createAccount(name: string, email: string) {
  const key = `${API_KEY_PREFIX}${randomToken(24)}`;
  const store = getStore();
  const trialCredit = trialCreditMicroUsdc();
  const { account, apiKey } = await store.createAccount(
    {
      name,
      email: email.toLowerCase(),
      balance_micro_usdc: trialCredit,
      trial_credit_micro_usdc: trialCredit,
      per_run_limit_micro_usdc: defaultPerRunLimitMicroUsdc(),
      daily_limit_micro_usdc: defaultDailyLimitMicroUsdc()
    },
    {
      account_id: "",
      name: "Default agent key",
      key_prefix: key.slice(0, 12),
      key_hash: hashApiKey(key)
    }
  );

  return { account, apiKey, key };
}

export type ProvisionInput = {
  name: string;
  email: string;
  supabaseUserId?: string | null;
  walletAddress?: string | null;
  walletId?: string | null;
};

export async function provisionAccount(input: ProvisionInput) {
  const store = getStore();
  const trialCredit = trialCreditMicroUsdc();
  const key = `${API_KEY_PREFIX}${randomToken(24)}`;
  const { account, apiKey } = await store.createAccount(
    {
      name: input.name,
      email: input.email.toLowerCase(),
      balance_micro_usdc: trialCredit,
      trial_credit_micro_usdc: trialCredit,
      per_run_limit_micro_usdc: defaultPerRunLimitMicroUsdc(),
      daily_limit_micro_usdc: defaultDailyLimitMicroUsdc()
    },
    {
      account_id: "",
      name: "Default agent key",
      key_prefix: key.slice(0, 12),
      key_hash: hashApiKey(key)
    }
  );
  if (input.supabaseUserId) {
    await store.linkSupabaseUser(account.id, input.supabaseUserId);
  }
  if (input.walletId && input.walletAddress) {
    await store.attachAccountWallet(account.id, input.walletId, input.walletAddress);
  }
  const final = await store.getAccount(account.id);
  return { account: final ?? { ...account, supabase_user_id: input.supabaseUserId ?? null, circle_wallet_id: input.walletId ?? account.circle_wallet_id, circle_wallet_address: input.walletAddress ?? account.circle_wallet_address }, apiKey, key };
}

export async function requireAccountSession(request: Request): Promise<AccountSession> {
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new Error("CitationPay API key required");

  const session = await getStore().authenticateApiKey(hashApiKey(token));
  if (!session) throw new Error("Invalid CitationPay API key");
  if (session.account.status !== "active") throw new Error("Account is disabled");
  return session;
}

export async function requireSession(request: Request): Promise<AccountSession> {
  const bearer = request.headers.get("authorization") || "";
  const token = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
  if (token) {
    const session = await getStore().authenticateApiKey(hashApiKey(token));
    if (!session) throw new Error("Invalid CitationPay API key");
    if (session.account.status !== "active") throw new Error("Account is disabled");
    return session;
  }
  const { createSupabaseServer } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Authentication required");
  const store = getStore();
  const account = await store.findAccountBySupabaseUser(data.user.id);
  if (!account) throw new Error("No CitationPay account linked to this user");
  if (account.status !== "active") throw new Error("Account is disabled");
  let apiKey = await store.findAccountApiKeyByName(account.id, "Default agent key");
  if (!apiKey) {
    const fresh = `${API_KEY_PREFIX}${randomToken(24)}`;
    apiKey = await store.createAccountApiKey({
      account_id: account.id,
      name: "Default agent key",
      key_prefix: fresh.slice(0, 12),
      key_hash: hashApiKey(fresh)
    });
  }
  return { account, apiKey };
}

export function assertAccountCanSpend(account: Account, budgetMicroUsdc: number) {
  if (budgetMicroUsdc > account.per_run_limit_micro_usdc) {
    throw new Error(`Run budget exceeds account per-run limit of ${formatMicroUsdc(account.per_run_limit_micro_usdc)}`);
  }
  if (budgetMicroUsdc > account.balance_micro_usdc) {
    throw new Error(`Insufficient account balance. Available ${formatMicroUsdc(account.balance_micro_usdc)}.`);
  }
}

export async function assertAccountCanSpendToday(account: Account, budgetMicroUsdc: number) {
  assertAccountCanSpend(account, budgetMicroUsdc);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const spentToday = await getStore().sumAccountDebitsSince(account.id, dayStart.toISOString());
  if (spentToday + budgetMicroUsdc > account.daily_limit_micro_usdc) {
    throw new Error(`Run budget exceeds account daily limit. Remaining today ${formatMicroUsdc(Math.max(0, account.daily_limit_micro_usdc - spentToday))}.`);
  }
}

export async function debitAccountForRun(account: Account, run: AgentRun, spentMicroUsdc: number) {
  return getStore().debitAccount(
    account.id,
    run.id,
    spentMicroUsdc,
    `Paid citations for run ${run.id}`
  );
}

export function serializeAccount(account: Account) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    status: account.status,
    balanceMicroUsdc: account.balance_micro_usdc,
    trialCreditMicroUsdc: account.trial_credit_micro_usdc,
    perRunLimitMicroUsdc: account.per_run_limit_micro_usdc,
    dailyLimitMicroUsdc: account.daily_limit_micro_usdc,
    circleWalletId: account.circle_wallet_id,
    circleWalletAddress: account.circle_wallet_address,
    createdAt: account.created_at
  };
}

function hashApiKey(key: string) {
  return sha256(`citationpay:${key}`);
}
