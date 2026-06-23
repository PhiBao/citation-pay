-- Auth + Wallets + Publisher claims migration

alter table accounts add column if not exists supabase_user_id uuid unique;
alter table accounts add column if not exists onboarding_step text not null default 'ready';
alter table accounts add column if not exists onboarding_completed_at timestamptz;

alter table publishers add column if not exists supabase_user_id uuid;
alter table publishers add column if not exists verified boolean not null default false;
alter table publishers add column if not exists default_price_micro_usdc integer not null default 1000;

create table if not exists publisher_claims (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references publishers(id) on delete cascade,
  supabase_user_id uuid not null,
  wallet_address text not null,
  verification_challenge text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists wallet_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  publisher_id uuid references publishers(id) on delete set null,
  kind text not null check (kind in ('deposit', 'sweep', 'withdrawal', 'faucet', 'settlement')),
  amount_micro_usdc bigint not null check (amount_micro_usdc >= 0),
  tx_hash text,
  network text not null,
  from_address text,
  to_address text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create unique index if not exists publisher_claims_active_idx
  on publisher_claims(publisher_id, supabase_user_id)
  where status in ('pending', 'verified');

create index if not exists wallet_events_account_idx on wallet_events(account_id);
create index if not exists wallet_events_publisher_idx on wallet_events(publisher_id);
create index if not exists wallet_events_status_idx on wallet_events(status);

alter table publisher_claims enable row level security;
alter table wallet_events enable row level security;
alter table publisher_claims force row level security;
alter table wallet_events force row level security;
revoke all on table publisher_claims from anon, authenticated;
revoke all on table wallet_events from anon, authenticated;

create index if not exists sources_publisher_published_idx on sources(publisher_id, published_at desc);
create index if not exists citation_payments_seller_idx on citation_payments(seller_wallet, created_at desc);
