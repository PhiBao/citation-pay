# CitationPay

CitationPay is an agent-first nanopayment app for the Lepton Agents Hackathon. An autonomous research agent receives a question and a USDC budget, discovers relevant publisher content from RSS feeds, pays selected sources through Circle Gateway/x402 on Arc Testnet, and returns an answer with paid citation receipts.

The core idea: if AI agents use publisher work as source material, the publisher should earn at the moment of citation, even when the amount is too small for traditional payment rails.

## Why This Exists

Publishers and creators are increasingly read by AI agents, summarizers, and aggregators instead of only by humans visiting a page. Today, that source work is usually unpaid. CitationPay turns citation into a payable event:

1. A publisher registers an RSS or Atom feed.
2. Each imported post becomes a priced citation source.
3. The agent receives a user question and a spending budget.
4. The agent searches sources, chooses which ones are worth paying for, and pays only those sources.
5. Circle Gateway settles the x402 payments on Arc Testnet.
6. The final answer includes source links and payment receipt IDs.

This maps directly to **RFB 6: Creator & Publisher Monetization**, while also showing meaningful agentic behavior: the AI agent makes budgeted purchasing decisions instead of simply automating a checkout.

## What The App Does

- **Publisher onboarding**: add a publisher name, receiving wallet, RSS/Atom URL, and default citation price.
- **RSS ingestion**: fetches and deduplicates feed items, then indexes titles and excerpts for search.
- **Agent source selection**: ranks candidate sources against the user question and budget.
- **Real x402 payments**: protected citation endpoints return `402 Payment Required`; the agent wallet signs and retries with `Payment-Signature`.
- **Gateway settlement**: the server verifies and settles through Circle Gateway on Arc Testnet.
- **Receipt dashboard**: shows publishers, imported sources, agent runs, settled payments, transfer IDs, and spend.

## Live Payment Flow

The current app is intentionally **agent-wallet first**:

- The user does not connect a wallet.
- The autonomous agent has its own server-side wallet and Gateway balance.
- The agent spends from its budget when it decides a source is worth citing.
- Publisher private keys are never stored; publishers only provide a receiving wallet.

This is the strongest hackathon story for an agent payments round. A wallet-connect reader checkout can be added later, but the MVP is about agents autonomously paying for source material.

Payment sequence:

1. `POST /api/agent/answer` creates an agent run.
2. The agent searches indexed publisher sources.
3. For each selected citation, it calls `GET /api/sources/:id/paid`.
4. The source endpoint returns `402` with a `PAYMENT-REQUIRED` header.
5. `GatewayClient` signs the x402 payment with the agent wallet.
6. The source endpoint verifies and settles with `BatchFacilitatorClient`.
7. The payment receipt is stored in Supabase.
8. The answer is composed using only paid source cards.

## Tech Stack

- **Next.js App Router** for UI and API routes
- **TypeScript** for app logic
- **Supabase Postgres** for persistence
- **Circle Gateway/x402 batching SDK** for gas-free nanopayments
- **Arc Testnet** as the settlement network
- **OpenAI API optional** for answer composition; without it, the app uses deterministic source excerpts

## Project Structure

```text
src/app/page.tsx                     Main app UI
src/app/api/agent/answer/route.ts    Agent run endpoint
src/app/api/feeds/import/route.ts    RSS/Atom import endpoint
src/app/api/publishers/route.ts      Publisher creation/list endpoint
src/app/api/sources/[id]/paid        x402-protected citation endpoint
src/lib/agent.ts                     Source ranking, payment loop, answer composition
src/lib/payment.ts                   Circle Gateway/x402 adapter
src/lib/db.ts                        Supabase store with local JSON fallback
src/lib/rss.ts                       RSS/Atom parser and URL validation
supabase/schema.sql                  Current schema snapshot
supabase/migrations                  Remote migration history and hardening
```

## Environment

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Required for the real hackathon flow:

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
```

Optional:

```bash
OPENAI_API_KEY=...
```

Important:

- `NEXT_PUBLIC_APP_URL` must be the real public URL in production. The Gateway buyer flow calls back into `/api/sources/:id/paid`, so `localhost` only works for local testing.
- `BUYER_PRIVATE_KEY` is the autonomous agent wallet. Keep it server-only.
- The buyer wallet must have USDC deposited into Circle Gateway on Arc Testnet.
- Publisher receiving wallets must be different from the agent wallet; Gateway rejects self-transfers.

## Run Locally

```bash
pnpm install
pnpm dev
```

Open:

```text
http://localhost:3000
```

If port `3000` is occupied, run:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3001 pnpm exec next dev -p 3001
```

Use `PAYMENT_MODE=real` only when `NEXT_PUBLIC_APP_URL` matches the actual URL the agent can call.

## Supabase Setup

Run the schema against your Supabase project:

```bash
supabase link --project-ref <project-ref>
supabase db push --linked
```

Security choices:

- Row-Level Security is enabled and forced on CitationPay tables.
- `anon` and `authenticated` direct table privileges are revoked.
- The browser talks to app API routes, not directly to tables.
- Server routes use `SUPABASE_SERVICE_ROLE_KEY`.

This prevents the Supabase warning where public tables are readable/editable/deletable through the project URL.

## Real Payment Setup Checklist

1. Install or configure Circle tooling as needed for wallet funding.
2. Fund the agent wallet with Arc Testnet USDC.
3. Deposit USDC into Circle Gateway for the agent wallet.
4. Set `BUYER_PRIVATE_KEY` and `BUYER_ADDRESS`.
5. Set `PAYMENT_MODE=real`.
6. Set `NEXT_PUBLIC_APP_URL` to the deployed app URL.
7. Add at least one publisher with a receiving wallet different from the agent wallet.
8. Import an RSS feed.
9. Run the agent with a budget large enough to cover selected citations.

The app was verified with a real Arc Testnet Gateway run: the agent paid four citations, received settlement IDs, and the Gateway balance decreased by the expected amount.

## API Reference

### `POST /api/publishers`

Creates a publisher.

```json
{
  "name": "Ethereum Foundation Blog",
  "walletAddress": "0x...",
  "defaultPriceUsd": 0.0001
}
```

### `POST /api/feeds/import`

Imports an RSS or Atom feed for a publisher.

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
  "query": "What protocol upgrades is Ethereum discussing recently?",
  "budgetUsd": 0.001
}
```

Returns an answer, spend amount, selected citations, and receipt IDs.

### `GET /api/sources/:id/paid`

x402-protected source endpoint.

- Without payment: returns `402` and `PAYMENT-REQUIRED`.
- With valid `Payment-Signature`: settles and returns the paid source card.

### `GET /api/dashboard`

Returns publishers, feeds, sources, agent runs, payments, and current payment mode.

## Verification Commands

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Check agent Gateway balance:

```bash
node - <<'NODE'
const { GatewayClient } = require('@circle-fin/x402-batching/client');
const client = new GatewayClient({
  chain: 'arcTestnet',
  privateKey: process.env.BUYER_PRIVATE_KEY
});
client.getBalances().then((balances) => {
  console.log({
    address: client.address,
    gatewayAvailable: balances.gateway.formattedAvailable,
    walletUsdc: balances.wallet.formatted
  });
});
NODE
```

## Troubleshooting

### `self_transfer`

The publisher receiving wallet is the same as the agent wallet. Use a different receiving wallet.

### `Resource does not require payment (not 402)`

`PAYMENT_MODE` is probably `mock`, or the paid URL is not pointing at the deployed app. Set `PAYMENT_MODE=real` and verify `NEXT_PUBLIC_APP_URL`.

### `Missing real payment env`

Set `BUYER_PRIVATE_KEY` and `BUYER_ADDRESS`.

### Gateway balance is zero

The wallet may have USDC in the wallet but not in Gateway. Deposit into Circle Gateway before running the agent.

### Supabase public table warning

Run the migrations and confirm RLS is enabled. CitationPay tables are designed for server-side access only.
