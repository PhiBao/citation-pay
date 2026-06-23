create extension if not exists pgcrypto;

create table if not exists publishers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wallet_address text not null,
  default_price_micro_usdc integer not null check (default_price_micro_usdc > 0),
  owner_token_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists feeds (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references publishers(id) on delete cascade,
  url text not null,
  title text not null,
  status text not null default 'active',
  last_imported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (publisher_id, url)
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references publishers(id) on delete cascade,
  feed_id uuid not null references feeds(id) on delete cascade,
  title text not null,
  canonical_url text not null,
  excerpt text not null,
  content_hash text not null,
  price_micro_usdc integer not null check (price_micro_usdc > 0),
  published_at timestamptz,
  search_text text not null,
  created_at timestamptz not null default now(),
  unique (content_hash)
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  status text not null default 'active' check (status in ('active', 'disabled')),
  balance_micro_usdc integer not null default 0 check (balance_micro_usdc >= 0),
  trial_credit_micro_usdc integer not null default 0 check (trial_credit_micro_usdc >= 0),
  per_run_limit_micro_usdc integer not null default 1000 check (per_run_limit_micro_usdc > 0),
  daily_limit_micro_usdc integer not null default 10000 check (daily_limit_micro_usdc > 0),
  circle_wallet_id text,
  circle_wallet_address text,
  created_at timestamptz not null default now()
);

create table if not exists account_api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  api_key_id uuid references account_api_keys(id) on delete set null,
  client_type text not null default 'web' check (client_type in ('web', 'mcp', 'internal')),
  query text not null,
  budget_micro_usdc integer not null check (budget_micro_usdc > 0),
  spent_micro_usdc integer not null default 0,
  answer text not null default '',
  status text not null default 'running',
  created_at timestamptz not null default now()
);

create table if not exists citation_payments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  source_id uuid not null references sources(id) on delete cascade,
  payer_wallet text not null,
  seller_wallet text not null,
  amount_micro_usdc integer not null check (amount_micro_usdc > 0),
  network text not null,
  transfer_id text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  run_id uuid references agent_runs(id) on delete set null,
  kind text not null check (kind in ('credit', 'debit', 'refund')),
  amount_micro_usdc integer not null check (amount_micro_usdc >= 0),
  balance_after_micro_usdc integer not null check (balance_after_micro_usdc >= 0),
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists agent_decisions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  action text not null check (action in ('paid', 'cached', 'skipped')),
  score integer not null check (score >= 0),
  reason text not null,
  price_micro_usdc integer not null check (price_micro_usdc > 0),
  created_at timestamptz not null default now()
);

create table if not exists paid_source_cache (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  source_id uuid not null references sources(id) on delete cascade,
  payment_id uuid references citation_payments(id) on delete set null,
  publisher_id uuid not null references publishers(id) on delete cascade,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sources_search_text_idx on sources using gin (to_tsvector('english', search_text));
create index if not exists citation_payments_run_idx on citation_payments(run_id);
create index if not exists citation_payments_account_idx on citation_payments(account_id);
create unique index if not exists citation_payments_transfer_unique_idx on citation_payments(network, transfer_id);
create index if not exists agent_decisions_run_idx on agent_decisions(run_id);
create index if not exists paid_source_cache_source_idx on paid_source_cache(source_id);
create index if not exists agent_runs_account_idx on agent_runs(account_id);
create index if not exists ledger_entries_account_idx on ledger_entries(account_id);

alter table publishers enable row level security;
alter table feeds enable row level security;
alter table sources enable row level security;
alter table accounts enable row level security;
alter table account_api_keys enable row level security;
alter table agent_runs enable row level security;
alter table citation_payments enable row level security;
alter table ledger_entries enable row level security;
alter table agent_decisions enable row level security;
alter table paid_source_cache enable row level security;

alter table publishers force row level security;
alter table feeds force row level security;
alter table sources force row level security;
alter table accounts force row level security;
alter table account_api_keys force row level security;
alter table agent_runs force row level security;
alter table citation_payments force row level security;
alter table ledger_entries force row level security;
alter table agent_decisions force row level security;
alter table paid_source_cache force row level security;

revoke all on table publishers from anon, authenticated;
revoke all on table feeds from anon, authenticated;
revoke all on table sources from anon, authenticated;
revoke all on table accounts from anon, authenticated;
revoke all on table account_api_keys from anon, authenticated;
revoke all on table agent_runs from anon, authenticated;
revoke all on table citation_payments from anon, authenticated;
revoke all on table ledger_entries from anon, authenticated;
revoke all on table agent_decisions from anon, authenticated;
revoke all on table paid_source_cache from anon, authenticated;
