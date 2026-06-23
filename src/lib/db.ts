import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { nowIso, sha256, uuid } from "@/lib/crypto";
import { hasSupabaseEnv } from "@/lib/env";
import type {
  Account,
  AccountApiKey,
  AgentDecisionRecord,
  AgentRun,
  CitationPayment,
  DashboardData,
  Feed,
  LedgerEntry,
  PaidSourceCache,
  Publisher,
  Source,
  SourceWithPublisher
} from "@/lib/types";

type NewPublisher = {
  name: string;
  wallet_address: string;
  default_price_micro_usdc: number;
};

type NewFeed = {
  publisher_id: string;
  url: string;
  title: string;
};

type NewSource = {
  publisher_id: string;
  feed_id: string;
  title: string;
  canonical_url: string;
  excerpt: string;
  content_hash: string;
  price_micro_usdc: number;
  published_at: string | null;
  search_text: string;
};

type NewPayment = Omit<CitationPayment, "id" | "created_at">;
type NewDecision = Omit<AgentDecisionRecord, "id" | "created_at">;
type NewCache = Omit<PaidSourceCache, "id" | "created_at" | "paid_at"> & { paid_at?: string };
type NewAccount = Pick<Account, "name" | "email" | "balance_micro_usdc" | "trial_credit_micro_usdc" | "per_run_limit_micro_usdc" | "daily_limit_micro_usdc">;
type NewApiKey = Pick<AccountApiKey, "account_id" | "name" | "key_prefix" | "key_hash">;
type NewLedgerEntry = Omit<LedgerEntry, "id" | "created_at">;
type RunContext = { accountId?: string | null; apiKeyId?: string | null; clientType?: AgentRun["client_type"] };

export interface Store {
  createAccount(input: NewAccount, apiKey: NewApiKey): Promise<{ account: Account; apiKey: AccountApiKey }>;
  listAccounts(): Promise<Account[]>;
  authenticateApiKey(keyHash: string): Promise<{ account: Account; apiKey: AccountApiKey } | null>;
  getAccount(id: string): Promise<Account | null>;
  sumAccountDebitsSince(accountId: string, sinceIso: string): Promise<number>;
  debitAccount(accountId: string, runId: string, amountMicroUsdc: number, description: string): Promise<Account>;
  createLedgerEntry(input: NewLedgerEntry): Promise<LedgerEntry>;
  createPublisher(input: NewPublisher): Promise<Publisher>;
  listPublishers(): Promise<Publisher[]>;
  upsertFeed(input: NewFeed): Promise<Feed>;
  upsertSources(sources: NewSource[]): Promise<Source[]>;
  listSources(): Promise<SourceWithPublisher[]>;
  searchSources(query: string, limit: number): Promise<SourceWithPublisher[]>;
  getSource(id: string): Promise<SourceWithPublisher | null>;
  createRun(query: string, budgetMicroUsdc: number, context?: RunContext): Promise<AgentRun>;
  finishRun(id: string, status: AgentRun["status"], answer: string, spentMicroUsdc: number): Promise<AgentRun>;
  createDecision(input: NewDecision): Promise<AgentDecisionRecord>;
  findCachedPaidSource(contentHash: string): Promise<PaidSourceCache | null>;
  upsertPaidSourceCache(input: NewCache): Promise<PaidSourceCache>;
  createPayment(input: NewPayment): Promise<CitationPayment>;
  dashboard(): Promise<DashboardData>;
}

let cachedStore: Store | null = null;

export function getStore(): Store {
  if (cachedStore) return cachedStore;
  cachedStore = hasSupabaseEnv() ? new SupabaseStore() : new JsonFileStore();
  return cachedStore;
}

class SupabaseStore implements Store {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }

  async createAccount(input: NewAccount, apiKey: NewApiKey) {
    const { data: account, error: accountError } = await this.client
      .from("accounts")
      .insert(input)
      .select("*")
      .single();
    if (accountError) throw new Error(accountError.message);

    const accountData = account as Account;
    const { data: savedKey, error: keyError } = await this.client
      .from("account_api_keys")
      .insert({ ...apiKey, account_id: accountData.id })
      .select("*")
      .single();
    if (keyError) throw new Error(keyError.message);

    if (input.balance_micro_usdc > 0) {
      await this.createLedgerEntry({
        account_id: accountData.id,
        run_id: null,
        kind: "credit",
        amount_micro_usdc: input.balance_micro_usdc,
        balance_after_micro_usdc: input.balance_micro_usdc,
        description: "Initial trial credit"
      });
    }

    return { account: accountData, apiKey: savedKey as AccountApiKey };
  }

  async listAccounts() {
    const { data, error } = await this.client
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data || []) as Account[];
  }

  async authenticateApiKey(keyHash: string) {
    const { data, error } = await this.client
      .from("account_api_keys")
      .select("*, account:accounts(*)")
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.account) return null;

    await this.client
      .from("account_api_keys")
      .update({ last_used_at: nowIso() })
      .eq("id", data.id);

    return {
      account: data.account as Account,
      apiKey: {
        id: data.id,
        account_id: data.account_id,
        name: data.name,
        key_prefix: data.key_prefix,
        key_hash: data.key_hash,
        last_used_at: nowIso(),
        created_at: data.created_at
      } as AccountApiKey
    };
  }

  async getAccount(id: string) {
    const { data, error } = await this.client.from("accounts").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data || null) as Account | null;
  }

  async sumAccountDebitsSince(accountId: string, sinceIso: string) {
    const { data, error } = await this.client
      .from("ledger_entries")
      .select("amount_micro_usdc")
      .eq("account_id", accountId)
      .eq("kind", "debit")
      .gte("created_at", sinceIso);
    if (error) throw new Error(error.message);
    return (data || []).reduce((sum, entry) => sum + Number(entry.amount_micro_usdc || 0), 0);
  }

  async debitAccount(accountId: string, runId: string, amountMicroUsdc: number, description: string) {
    const account = await this.getAccount(accountId);
    if (!account) throw new Error("Account not found");
    if (amountMicroUsdc === 0) return account;
    if (account.balance_micro_usdc < amountMicroUsdc) throw new Error("Insufficient account balance");

    const nextBalance = account.balance_micro_usdc - amountMicroUsdc;
    const { data, error } = await this.client
      .from("accounts")
      .update({ balance_micro_usdc: nextBalance })
      .eq("id", accountId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await this.createLedgerEntry({
      account_id: accountId,
      run_id: runId,
      kind: "debit",
      amount_micro_usdc: amountMicroUsdc,
      balance_after_micro_usdc: nextBalance,
      description
    });

    return data as Account;
  }

  async createLedgerEntry(input: NewLedgerEntry) {
    const { data, error } = await this.client.from("ledger_entries").insert(input).select("*").single();
    if (error) throw new Error(error.message);
    return data as LedgerEntry;
  }

  async createPublisher(input: NewPublisher) {
    const { data, error } = await this.client
      .from("publishers")
      .insert({ ...input, owner_token_hash: sha256(`${input.wallet_address}:${Date.now()}`) })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as Publisher;
  }

  async listPublishers() {
    const { data, error } = await this.client
      .from("publishers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as Publisher[];
  }

  async upsertFeed(input: NewFeed) {
    const { data, error } = await this.client
      .from("feeds")
      .upsert(
        {
          ...input,
          status: "active",
          last_imported_at: nowIso()
        },
        { onConflict: "publisher_id,url" }
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as Feed;
  }

  async upsertSources(sources: NewSource[]) {
    if (sources.length === 0) return [];
    const { data, error } = await this.client
      .from("sources")
      .upsert(sources, { onConflict: "content_hash", ignoreDuplicates: false })
      .select("*");
    if (error) throw new Error(error.message);
    return (data || []) as Source[];
  }

  async listSources() {
    const { data, error } = await this.client
      .from("sources")
      .select("*, publisher:publishers(id,name,wallet_address)")
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw new Error(error.message);
    return (data || []) as SourceWithPublisher[];
  }

  async searchSources(query: string, limit: number) {
    const terms = query
      .split(/\W+/)
      .filter((term) => term.length > 2)
      .slice(0, 6)
      .map((term) => term.replace(/[%*,()]/g, ""));
    let request = this.client
      .from("sources")
      .select("*, publisher:publishers(id,name,wallet_address)")
      .limit(limit);
    if (terms.length > 0) {
      request = request.or(terms.map((term) => `search_text.ilike.%${term}%`).join(","));
    }
    const { data, error } = await request;
    if (error) throw new Error(error.message);
    return (data || []) as SourceWithPublisher[];
  }

  async getSource(id: string) {
    const { data, error } = await this.client
      .from("sources")
      .select("*, publisher:publishers(id,name,wallet_address)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data || null) as SourceWithPublisher | null;
  }

  async createRun(query: string, budgetMicroUsdc: number, context: RunContext = {}) {
    const { data, error } = await this.client
      .from("agent_runs")
      .insert({
        query,
        budget_micro_usdc: budgetMicroUsdc,
        account_id: context.accountId || null,
        api_key_id: context.apiKeyId || null,
        client_type: context.clientType || "web"
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as AgentRun;
  }

  async finishRun(id: string, status: AgentRun["status"], answer: string, spentMicroUsdc: number) {
    const { data, error } = await this.client
      .from("agent_runs")
      .update({ status, answer, spent_micro_usdc: spentMicroUsdc })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as AgentRun;
  }

  async createPayment(input: NewPayment) {
    const { data, error } = await this.client.from("citation_payments").insert(input).select("*").single();
    if (error) throw new Error(error.message);
    return data as CitationPayment;
  }

  async createDecision(input: NewDecision) {
    const { data, error } = await this.client.from("agent_decisions").insert(input).select("*").single();
    if (error) throw new Error(error.message);
    return data as AgentDecisionRecord;
  }

  async findCachedPaidSource(contentHash: string) {
    const { data, error } = await this.client
      .from("paid_source_cache")
      .select("*")
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data || null) as PaidSourceCache | null;
  }

  async upsertPaidSourceCache(input: NewCache) {
    const { data, error } = await this.client
      .from("paid_source_cache")
      .upsert(
        {
          ...input,
          paid_at: input.paid_at || nowIso()
        },
        { onConflict: "content_hash" }
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as PaidSourceCache;
  }

  async dashboard() {
    const [accounts, publishers, feeds, sources, runs, payments, decisions, cache] = await Promise.all([
      this.client.from("accounts").select("*").order("created_at", { ascending: false }).limit(50),
      this.client.from("publishers").select("*").order("created_at", { ascending: false }),
      this.client.from("feeds").select("*").order("created_at", { ascending: false }),
      this.client.from("sources").select("*, publisher:publishers(id,name,wallet_address)").order("created_at", { ascending: false }).limit(80),
      this.client.from("agent_runs").select("*").order("created_at", { ascending: false }).limit(30),
      this.client.from("citation_payments").select("*, source:sources(*, publisher:publishers(id,name,wallet_address)), run:agent_runs(*)").order("created_at", { ascending: false }).limit(80),
      this.client.from("agent_decisions").select("*, source:sources(*, publisher:publishers(id,name,wallet_address)), run:agent_runs(*)").order("created_at", { ascending: false }).limit(120),
      this.client.from("paid_source_cache").select("*, source:sources(*, publisher:publishers(id,name,wallet_address))").order("paid_at", { ascending: false }).limit(80)
    ]);
    for (const result of [accounts, publishers, feeds, sources, runs, payments, decisions, cache]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      accounts: (accounts.data || []) as Account[],
      publishers: (publishers.data || []) as Publisher[],
      feeds: (feeds.data || []) as Feed[],
      sources: (sources.data || []) as SourceWithPublisher[],
      runs: (runs.data || []) as AgentRun[],
      payments: (payments.data || []) as DashboardData["payments"],
      decisions: (decisions.data || []) as DashboardData["decisions"],
      cache: (cache.data || []) as DashboardData["cache"]
    };
  }
}

type LocalData = {
  accounts: Account[];
  apiKeys: AccountApiKey[];
  ledger: LedgerEntry[];
  publishers: Publisher[];
  feeds: Feed[];
  sources: Source[];
  runs: AgentRun[];
  payments: CitationPayment[];
  decisions: AgentDecisionRecord[];
  cache: PaidSourceCache[];
};

const emptyData = (): LocalData => ({
  accounts: [] as Account[],
  apiKeys: [] as AccountApiKey[],
  ledger: [] as LedgerEntry[],
  publishers: [] as Publisher[],
  feeds: [] as Feed[],
  sources: [] as Source[],
  runs: [] as AgentRun[],
  payments: [] as CitationPayment[],
  decisions: [] as AgentDecisionRecord[],
  cache: [] as PaidSourceCache[]
});

class JsonFileStore implements Store {
  private filePath = path.join(process.cwd(), ".data", "citationpay.json");

  async createAccount(input: NewAccount, apiKey: NewApiKey) {
    const data = await this.load();
    const account: Account = {
      id: uuid(),
      status: "active",
      circle_wallet_id: null,
      circle_wallet_address: null,
      created_at: nowIso(),
      ...input
    };
    const savedKey: AccountApiKey = {
      id: uuid(),
      account_id: account.id,
      name: apiKey.name,
      key_prefix: apiKey.key_prefix,
      key_hash: apiKey.key_hash,
      last_used_at: null,
      created_at: nowIso()
    };
    data.accounts.unshift(account);
    data.apiKeys.unshift(savedKey);
    if (account.balance_micro_usdc > 0) {
      data.ledger.unshift({
        id: uuid(),
        account_id: account.id,
        run_id: null,
        kind: "credit",
        amount_micro_usdc: account.balance_micro_usdc,
        balance_after_micro_usdc: account.balance_micro_usdc,
        description: "Initial trial credit",
        created_at: nowIso()
      });
    }
    await this.save(data);
    return { account, apiKey: savedKey };
  }

  async listAccounts() {
    return (await this.load()).accounts;
  }

  async authenticateApiKey(keyHash: string) {
    const data = await this.load();
    const apiKey = data.apiKeys.find((item) => item.key_hash === keyHash);
    if (!apiKey) return null;
    const account = data.accounts.find((item) => item.id === apiKey.account_id);
    if (!account) return null;
    apiKey.last_used_at = nowIso();
    await this.save(data);
    return { account, apiKey };
  }

  async getAccount(id: string) {
    const data = await this.load();
    return data.accounts.find((item) => item.id === id) || null;
  }

  async sumAccountDebitsSince(accountId: string, sinceIso: string) {
    const data = await this.load();
    const since = new Date(sinceIso).getTime();
    return data.ledger
      .filter((entry) => entry.account_id === accountId && entry.kind === "debit" && new Date(entry.created_at).getTime() >= since)
      .reduce((sum, entry) => sum + entry.amount_micro_usdc, 0);
  }

  async debitAccount(accountId: string, runId: string, amountMicroUsdc: number, description: string) {
    const data = await this.load();
    const account = data.accounts.find((item) => item.id === accountId);
    if (!account) throw new Error("Account not found");
    if (amountMicroUsdc === 0) return account;
    if (account.balance_micro_usdc < amountMicroUsdc) throw new Error("Insufficient account balance");
    account.balance_micro_usdc -= amountMicroUsdc;
    data.ledger.unshift({
      id: uuid(),
      account_id: accountId,
      run_id: runId,
      kind: "debit",
      amount_micro_usdc: amountMicroUsdc,
      balance_after_micro_usdc: account.balance_micro_usdc,
      description,
      created_at: nowIso()
    });
    await this.save(data);
    return account;
  }

  async createLedgerEntry(input: NewLedgerEntry) {
    const data = await this.load();
    const entry: LedgerEntry = { id: uuid(), ...input, created_at: nowIso() };
    data.ledger.unshift(entry);
    await this.save(data);
    return entry;
  }

  async createPublisher(input: NewPublisher) {
    const data = await this.load();
    const publisher: Publisher = {
      id: uuid(),
      ...input,
      owner_token_hash: sha256(`${input.wallet_address}:${Date.now()}`),
      created_at: nowIso()
    };
    data.publishers.unshift(publisher);
    await this.save(data);
    return publisher;
  }

  async listPublishers() {
    return (await this.load()).publishers;
  }

  async upsertFeed(input: NewFeed) {
    const data = await this.load();
    const existing = data.feeds.find((feed) => feed.publisher_id === input.publisher_id && feed.url === input.url);
    if (existing) {
      existing.title = input.title;
      existing.status = "active";
      existing.last_imported_at = nowIso();
      await this.save(data);
      return existing;
    }
    const feed: Feed = {
      id: uuid(),
      ...input,
      status: "active",
      last_imported_at: nowIso(),
      created_at: nowIso()
    };
    data.feeds.unshift(feed);
    await this.save(data);
    return feed;
  }

  async upsertSources(sources: NewSource[]) {
    const data = await this.load();
    const saved: Source[] = [];
    for (const input of sources) {
      const existing = data.sources.find((source) => source.content_hash === input.content_hash);
      if (existing) {
        Object.assign(existing, input);
        saved.push(existing);
      } else {
        const source = { id: uuid(), ...input, created_at: nowIso() };
        data.sources.unshift(source);
        saved.push(source);
      }
    }
    await this.save(data);
    return saved;
  }

  async listSources() {
    const data = await this.load();
    return withPublishers(data, data.sources.slice(0, 80));
  }

  async searchSources(query: string, limit: number) {
    const data = await this.load();
    const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
    const scored = data.sources
      .map((source) => ({
        source,
        score: terms.reduce((score, term) => score + (source.search_text.toLowerCase().includes(term) ? 1 : 0), 0)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.source)
      .slice(0, limit);
    return withPublishers(data, scored.length > 0 ? scored : data.sources.slice(0, limit));
  }

  async getSource(id: string) {
    const data = await this.load();
    const source = data.sources.find((item) => item.id === id);
    return source ? withPublishers(data, [source])[0] : null;
  }

  async createRun(query: string, budgetMicroUsdc: number, context: RunContext = {}) {
    const data = await this.load();
    const run: AgentRun = {
      id: uuid(),
      account_id: context.accountId || null,
      api_key_id: context.apiKeyId || null,
      client_type: context.clientType || "web",
      query,
      budget_micro_usdc: budgetMicroUsdc,
      spent_micro_usdc: 0,
      answer: "",
      status: "running",
      created_at: nowIso()
    };
    data.runs.unshift(run);
    await this.save(data);
    return run;
  }

  async finishRun(id: string, status: AgentRun["status"], answer: string, spentMicroUsdc: number) {
    const data = await this.load();
    const run = data.runs.find((item) => item.id === id);
    if (!run) throw new Error("Run not found");
    run.status = status;
    run.answer = answer;
    run.spent_micro_usdc = spentMicroUsdc;
    await this.save(data);
    return run;
  }

  async createPayment(input: NewPayment) {
    const data = await this.load();
    const payment: CitationPayment = { id: uuid(), ...input, created_at: nowIso() };
    data.payments.unshift(payment);
    await this.save(data);
    return payment;
  }

  async createDecision(input: NewDecision) {
    const data = await this.load();
    const decision: AgentDecisionRecord = { id: uuid(), ...input, created_at: nowIso() };
    data.decisions.unshift(decision);
    await this.save(data);
    return decision;
  }

  async findCachedPaidSource(contentHash: string) {
    const data = await this.load();
    return data.cache.find((item) => item.content_hash === contentHash) || null;
  }

  async upsertPaidSourceCache(input: NewCache) {
    const data = await this.load();
    const existing = data.cache.find((item) => item.content_hash === input.content_hash);
    if (existing) {
      Object.assign(existing, {
        ...input,
        paid_at: input.paid_at || nowIso()
      });
      await this.save(data);
      return existing;
    }
    const cacheItem: PaidSourceCache = {
      id: uuid(),
      ...input,
      paid_at: input.paid_at || nowIso(),
      created_at: nowIso()
    };
    data.cache.unshift(cacheItem);
    await this.save(data);
    return cacheItem;
  }

  async dashboard() {
    const data = await this.load();
    const sources = withPublishers(data, data.sources.slice(0, 80));
    return {
      accounts: data.accounts,
      publishers: data.publishers,
      feeds: data.feeds,
      sources,
      runs: data.runs,
      payments: data.payments.map((payment) => ({
        ...payment,
        source: sources.find((source) => source.id === payment.source_id),
        run: data.runs.find((run) => run.id === payment.run_id)
      })),
      decisions: data.decisions.map((decision) => ({
        ...decision,
        source: sources.find((source) => source.id === decision.source_id),
        run: data.runs.find((run) => run.id === decision.run_id)
      })),
      cache: data.cache.map((cacheItem) => ({
        ...cacheItem,
        source: sources.find((source) => source.id === cacheItem.source_id)
      }))
    };
  }

  private async load(): Promise<LocalData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw) as Partial<LocalData>;
      return {
        accounts: data.accounts || [],
        apiKeys: data.apiKeys || [],
        ledger: data.ledger || [],
        publishers: data.publishers || [],
        feeds: data.feeds || [],
        sources: data.sources || [],
        runs: data.runs || [],
        payments: data.payments || [],
        decisions: data.decisions || [],
        cache: data.cache || []
      };
    } catch {
      return emptyData();
    }
  }

  private async save(data: LocalData) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}

function withPublishers(data: LocalData, sources: Source[]): SourceWithPublisher[] {
  return sources
    .map((source) => {
      const publisher = data.publishers.find((item) => item.id === source.publisher_id);
      if (!publisher) return null;
      return {
        ...source,
        publisher: {
          id: publisher.id,
          name: publisher.name,
          wallet_address: publisher.wallet_address
        }
      };
    })
    .filter(Boolean) as SourceWithPublisher[];
}
