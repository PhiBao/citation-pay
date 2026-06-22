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

create unique index if not exists citation_payments_transfer_unique_idx on citation_payments(network, transfer_id);
create index if not exists agent_decisions_run_idx on agent_decisions(run_id);
create index if not exists paid_source_cache_source_idx on paid_source_cache(source_id);

alter table agent_decisions enable row level security;
alter table paid_source_cache enable row level security;

alter table agent_decisions force row level security;
alter table paid_source_cache force row level security;

revoke all on table agent_decisions from anon, authenticated;
revoke all on table paid_source_cache from anon, authenticated;
