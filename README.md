# CitationPay

CitationPay is an agent-first citation toll layer for the Lepton Agents Hackathon. An autonomous research agent receives a question and USDC budget, searches priced publisher feeds, decides which citations are worth buying, pays selected sources through Circle Gateway/x402 on Arc Testnet, and returns an answer with receipts plus a visible decision ledger.

The product thesis is simple: if AI agents use publisher work as source material, publishers should earn at the moment of citation, even when the amount is too small for traditional payment rails.

## What It Does

- Publisher onboarding: add a publisher name, receiving wallet, RSS/Atom URL, and default citation price.
- RSS ingestion: fetches, validates, deduplicates, and indexes feed items for search.
- Agent decisions: scores sources by relevance, freshness, price fit, publisher diversity, and remaining budget.
- Decision ledger: records paid, skipped, and cached candidates so the agent's agency is inspectable.
- Real x402 payments: protected source endpoints return `402 Payment Required`; the agent signs and retries with `Payment-Signature`.
- Arc settlement: the server verifies and settles with Circle Gateway on Arc Testnet.
- Proof rail: shows payment mode, database health, latest run, receipt IDs, publisher count, source cache, and spend.

## Live Flow

1. `POST /api/agent/answer` creates an agent run.
2. The agent searches indexed publisher sources.
3. It records a decision ledger for paid and skipped candidates.
4. It checks whether a selected content hash was already paid.
5. For uncached sources, it calls `GET /api/sources/:id/paid`.
6. The source endpoint returns `402` with `PAYMENT-REQUIRED`.
7. `GatewayClient` signs the x402 payment with the autonomous buyer wallet.
8. The source endpoint verifies and settles with `BatchFacilitatorClient`.
9. The app stores the receipt, paid-source cache entry, and final answer in Supabase.

The user does not connect a wallet. The product is agent-wallet-first: the server-side agent spends from its own Gateway balance when it decides a citation is worth buying.

## Stack

- Next.js App Router
- TypeScript and React
- Supabase Postgres
- Circle Gateway/x402 batching SDK
- Arc Testnet
- Optional OpenAI answer composition

## Key Paths

```text
src/app/page.tsx                     Agent workbench and proof rail
src/app/api/agent/answer/route.ts    Agent run endpoint
src/app/api/dashboard/route.ts       Dashboard/proof data with degraded fallback
src/app/api/health/route.ts          Non-secret deployment health
src/app/api/feeds/import/route.ts    RSS/Atom import endpoint
src/app/api/publishers/route.ts      Publisher creation/list endpoint
src/app/api/sources/[id]/paid        x402-protected source endpoint
src/lib/agent.ts                     Scoring, ledger, cache, payment loop
src/lib/payment.ts                   Circle Gateway/x402 adapter
src/lib/db.ts                        Supabase store with JSON fallback
src/lib/rss.ts                       RSS parser and SSRF guards
supabase/schema.sql                  Schema snapshot
public/evidence/latest-run.json      Evidence artifact placeholder/current run
```

## Environment

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Required for the real submission flow:

```bash
NEXT_PUBLIC_APP_URL=https://your-deployed-url.example
PAYMENT_MODE=real

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

BUYER_PRIVATE_KEY=0x...
BUYER_ADDRESS=0x...
CIRCLE_FACILITATOR_URL=https://gateway-api-testnet.circle.com
ARC_TESTNET_NETWORK=eip155:5042002
ARC_RPC_URL=...

CIRCLE_API_KEY=...
CIRCLE_ENTITY_SECRET=...
CIRCLE_WALLET_ID=...

ADMIN_TOKEN=...
MAX_PUBLIC_BUDGET_MICRO_USDC=1000
```

Optional:

```bash
OPENAI_API_KEY=...
```

Important:

- `NEXT_PUBLIC_APP_URL` must be the real public URL for real x402 flows.
- `BUYER_PRIVATE_KEY` is the autonomous agent wallet and must stay server-only.
- The buyer wallet must have Arc Testnet USDC deposited into Circle Gateway.
- Publisher receiving wallets must differ from the agent wallet.
- `ARC_RPC_URL`, `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, and `CIRCLE_WALLET_ID` are tracked for Circle Wallet API operations, while the current x402 payment flow still uses `BUYER_PRIVATE_KEY`.
- `ADMIN_TOKEN` protects publisher/feed setup in production through `x-admin-token`.
- `MAX_PUBLIC_BUDGET_MICRO_USDC` caps public agent spend per run.

## Run Locally

```bash
pnpm install
pnpm dev
```

Open:

```text
http://localhost:3000
```

If port `3000` is occupied:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3001 pnpm exec next dev -p 3001
```

Use `PAYMENT_MODE=real` only when `NEXT_PUBLIC_APP_URL` points to a URL the Gateway callback can reach.

## Supabase Setup

```bash
supabase link --project-ref <project-ref>
supabase db push --linked
```

Security choices:

- CitationPay tables use RLS and forced RLS.
- Direct `anon` and `authenticated` table privileges are revoked.
- Browser code talks to Next.js API routes, not directly to Supabase tables.
- Server routes use `SUPABASE_SERVICE_ROLE_KEY`.

## API Reference

### `POST /api/publishers`

Creates a publisher. Production calls must include `x-admin-token`.

```json
{
  "name": "Ethereum Foundation Blog",
  "walletAddress": "0x...",
  "defaultPriceUsd": 0.0001
}
```

### `POST /api/feeds/import`

Imports an RSS or Atom feed. Production calls must include `x-admin-token`.

```json
{
  "publisherId": "uuid",
  "url": "https://blog.ethereum.org/feed.xml"
}
```

### `POST /api/agent/answer`

Runs the autonomous citation-buying agent.

```json
{
  "query": "What is changing in agent payments and publisher monetization?",
  "budgetUsd": 0.001
}
```

Returns an answer, spend amount, selected citations, receipt IDs, `ledger`, and `cacheEvents`.

### `GET /api/sources/:id/paid`

x402-protected source endpoint.

- Without payment: returns `402` and `PAYMENT-REQUIRED`.
- With valid `Payment-Signature`: settles and returns the paid source card.

### `GET /api/dashboard`

Returns publishers, feeds, sources, agent runs, payments, decision records, cache records, health state, and payment mode. If Supabase is unreachable, it returns a degraded empty dashboard instead of a blank `500`.

### `GET /api/health`

Returns non-secret deployment health for judges and smoke tests.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm build
curl -sS http://localhost:3000/api/health
```

Real-payment proof before submission should include:

- At least 10 settled Arc Testnet citation payments.
- At least 3 publisher receiving wallets.
- A successful public workbench run on the deployed URL.
- Updated `public/evidence/latest-run.json` with masked wallets, receipt IDs, spend, network, and selected source titles.

## Supabase Keepalive

The repo includes `.github/workflows/supabase-keepalive.yml`, scheduled every three days, to query the `publishers` table and prevent inactivity sleep.

Configure these GitHub repository secrets:

```text
SUPABASE_URL=https://gcwqsrqvezkapzkotfrn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

## Troubleshooting

### `self_transfer`

The publisher receiving wallet is the same as the agent wallet. Use a different receiving wallet.

### `Resource does not require payment (not 402)`

`PAYMENT_MODE` is probably `mock`, or the paid URL is not pointing at the deployed app.

### `Missing real payment env`

Set `BUYER_PRIVATE_KEY` and `BUYER_ADDRESS`.

### Gateway balance is zero

The wallet may have USDC in the wallet but not in Gateway. Deposit into Circle Gateway before running the agent.

### Dashboard shows database degraded

The app could not reach Supabase from the current environment. Check `NEXT_PUBLIC_SUPABASE_URL`, DNS reachability, and `SUPABASE_SERVICE_ROLE_KEY`.
