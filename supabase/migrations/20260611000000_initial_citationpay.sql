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

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
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
  source_id uuid not null references sources(id) on delete cascade,
  payer_wallet text not null,
  seller_wallet text not null,
  amount_micro_usdc integer not null check (amount_micro_usdc > 0),
  network text not null,
  transfer_id text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists sources_search_text_idx on sources using gin (to_tsvector('english', search_text));
create index if not exists citation_payments_run_idx on citation_payments(run_id);

alter table publishers enable row level security;
alter table feeds enable row level security;
alter table sources enable row level security;
alter table agent_runs enable row level security;
alter table citation_payments enable row level security;

alter table publishers force row level security;
alter table feeds force row level security;
alter table sources force row level security;
alter table agent_runs force row level security;
alter table citation_payments force row level security;

revoke all on table publishers from anon, authenticated;
revoke all on table feeds from anon, authenticated;
revoke all on table sources from anon, authenticated;
revoke all on table agent_runs from anon, authenticated;
revoke all on table citation_payments from anon, authenticated;
