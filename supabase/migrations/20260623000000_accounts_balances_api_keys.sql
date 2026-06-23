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

alter table agent_runs add column if not exists account_id uuid references accounts(id) on delete set null;
alter table agent_runs add column if not exists api_key_id uuid references account_api_keys(id) on delete set null;
alter table agent_runs add column if not exists client_type text not null default 'web' check (client_type in ('web', 'mcp', 'internal'));

alter table citation_payments add column if not exists account_id uuid references accounts(id) on delete set null;

create index if not exists agent_runs_account_idx on agent_runs(account_id);
create index if not exists citation_payments_account_idx on citation_payments(account_id);
create index if not exists ledger_entries_account_idx on ledger_entries(account_id);

alter table accounts enable row level security;
alter table account_api_keys enable row level security;
alter table ledger_entries enable row level security;

alter table accounts force row level security;
alter table account_api_keys force row level security;
alter table ledger_entries force row level security;

revoke all on table accounts from anon, authenticated;
revoke all on table account_api_keys from anon, authenticated;
revoke all on table ledger_entries from anon, authenticated;
