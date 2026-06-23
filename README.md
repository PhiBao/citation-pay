# CitationPay

Paid citations for AI agents on Arc. Publishers earn USDC every time their work grounds an answer.

**Product thesis:** AI agents consume publisher work as free substrate. CitationPay makes citation a **payable event** — an agent autonomously decides which sources are worth paying for, pays per-citation via x402 nanopayments on Arc, and the publisher earns the moment their work is used.

Built for the [Lepton Agents Hackathon](https://lepton.thecanteenapp.com) (Canteen × Circle × Arc, Jun 2026).

---

## Table of contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [User guide](#user-guide)
  - [Create an account](#1-create-an-account)
  - [Fund your balance](#2-fund-your-balance)
  - [Run a paid citation](#3-run-a-paid-citation)
  - [Connect an MCP client](#4-connect-an-mcp-client)
  - [Become a publisher](#5-become-a-publisher)
- [MCP server](#mcp-server)
- [Architecture](#architecture)
- [Circle / Arc integration](#circle--arc-integration)
- [API reference](#api-reference)
- [Environment](#environment)
- [Setup](#setup)
- [Verification](#verification)

---

## How it works

```
User                  CitationPay                   Publisher
 │                        │                             │
 ├─ fund account ─────────┤                             │
 │                        ├─ create wallet (Arc)        │
 │                        ├─ credit ledger              │
 │                        │                             │
 ├─ "What is changing     │                             │
 │   in agent payments?"  │                             │
 │                        ├─ search 249 sources         │
 │                        ├─ LLM scores cost/benefit    │
 │                        ├─ select ≤4 citations        │
 │                        ├─ pay via x402 ──────────────┤
 │                        │  (Gateway batched, <500ms)  ├─ USDC lands in wallet
 │                        ├─ cache content hash         │
 │                        ├─ compose cited answer       │
 │                        ├─ record receipt             │
 │                        │                             │
 │◄─ answer + ledger +    │                             │
 │   receipts + spend     │                             │
```

1. **Search** — the agent finds candidate sources from real RSS feeds.
2. **Reason** — an LLM cost/benefit step evaluates each source against the query and budget. The agent decides `pay` or `skip`.
3. **Pay** — selected citations are paid via x402 nanopayments (Circle Gateway). Gasless, sub-cent, settled on Arc in under a second.
4. **Cache** — previously paid content is reused for free.
5. **Compose** — paid/cached cards are assembled into a cited answer.
6. **Settle** — the publisher's Arc wallet receives USDC. They withdraw earnings via App Kit Send.

No anonymous request can spend real funds. Every paid run is tied to an account with per-run and daily spend limits.

### Key numbers

| | |
|---|---|
| Smallest payment | $0.000001 (1 micro-USDC) |
| Settlement time | <500ms on Arc |
| Gas | Zero (Gateway batched) |
| Trial credit | 1,000 micro-USDC (configurable) |
| Per-run limit | 1,000 micro-USDC (configurable) |
| Daily limit | 10,000 micro-USDC (configurable) |
| Seeded sources | 249 from 9 real RSS feeds |

---

## Quick start

```bash
pnpm install
cp .env.example .env.local
# Fill in your Supabase and Circle credentials
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Create an account, fund it, and run a paid citation in the playground.

---

## User guide

### 1. Create an account

Visit `/login`, enter your email and password. On first signup you receive:

- **Trial credit** (1,000 micro-USDC — $0.001) in your account balance.
- A **Circle developer-controlled wallet** on Arc Testnet.
- A default **cp_live_** API key for connecting agents.

No private keys, no wallet setup. The platform manages key infrastructure for you.

### 2. Fund your balance

**Faucet credit** — navigate to `/app/deposit` and click "Credit from faucet." The platform credits your balance instantly on Arc Testnet. For larger amounts, visit [TestMint](https://testmint.myproceeds.xyz) (the official Lepton faucet), send USDC to your Arc wallet address, then paste the tx hash to credit your balance.

Your Arc wallet address is visible on the account page (`/app`) and deposit page (`/app/deposit`).

### 3. Run a paid citation

Go to `/app/playground`. Enter a research query and a max spend. Click "Run paid answer."

The agent:
1. Searches 249 sources across 9 publishers.
2. Invokes an LLM cost/benefit step — the AI decides which sources are worth paying for.
3. Pays per citation via x402 on Arc.
4. Composes a cited answer.
5. Shows the full decision ledger (paid/cached/skipped with reasoning) and onchain receipts.

Previously paid sources are reused from cache at zero additional cost. The "LLM reasoning" badge lights up when the AI cost/benefit step runs.

### 4. Connect an MCP client

CitationPay exposes a real [Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp` over **Streamable HTTP**.

**From the web:** visit `/app/mcp` to browse tools, test them interactively, and copy a ready-to-paste MCP config.

**Claude Desktop config** (copy from the MCP page or type):

```json
{
  "mcpServers": {
    "citationpay": {
      "type": "http",
      "url": "https://lepton.thecanteenapp.com/api/mcp",
      "headers": {
        "Authorization": "Bearer cp_live_YOUR_KEY"
      }
    }
  }
}
```

The server speaks JSON-RPC 2.0, returns `Mcp-Session-Id` on initialize, and supports tools/call through the official `@modelcontextprotocol/sdk`.

### 5. Become a publisher

Visit `/publish`. Claim a publisher identity by naming your publication and providing an Arc wallet address. Import an RSS/Atom feed to populate priced sources. Set a per-citation price.

Your publisher dashboard (`/publish/[id]`) shows:
- Total citations earned
- Total USDC received
- Per-source earnings
- Onchain transfer receipts
- Withdrawal via App Kit Send to any address

---

## MCP server

Six tools registered via `@modelcontextprotocol/sdk`:

| Tool | Description |
|---|---|
| `search_sources` | Search priced publisher sources by free-text query. |
| `preview_citation` | Read a free preview of a priced source (no payment required). |
| `buy_citations` | Pay for citations by spending the account's USDC balance via x402 on Arc. |
| `answer_with_paid_citations` | Run the full agent loop: search, score, pay, compose answer. |
| `get_receipts` | Return recent settled citation receipts for the authenticated account. |
| `list_sources` | List the priced source market (most recently imported first). |

**Example — search sources from a terminal:**

```bash
# Step 1: initialize
curl -sS -X POST https://lepton.thecanteenapp.com/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1"}}}'

# → returns mcp-session-id header — save it

# Step 2: call a tool
curl -sS -X POST https://lepton.thecanteenapp.com/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-session-id: <SESSION_ID>' \
  -H 'authorization: Bearer cp_live_YOUR_KEY' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_sources","arguments":{"query":"nanopayments","limit":5}}}'
```

**Example — run a paid answer from MCP:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "answer_with_paid_citations",
    "arguments": {
      "query": "What is changing in agent payments on Arc?",
      "budgetUsd": "0.001"
    }
  }
}
```

Response:

```json
{
  "runId": "...",
  "answer": "Pagated answer with [1], [2], ... citations.",
  "spent": "$0.000200",
  "cacheEvents": 2,
  "balance": "$0.000800",
  "ledger": [...],
  "decisions": [...]
}
```

---

## Architecture

```
┌──────────────────────────────────────────────┐
│                   CitationPay                  │
│                                                │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐ │
│  │  Next.js  │  │  Supabase   │  │  Circle   │ │
│  │  App      │  │  (accounts, │  │  (wallets,│ │
│  │  Router   │  │  sources,   │  │  x402,    │ │
│  │          │  │  payments,  │  │  App Kit) │ │
│  │  ┌─────┐ │  │  ledger)    │  │           │ │
│  │  │MCP  │ │  │             │  │  ┌───────┐│ │
│  │  │SDK  │ │  └────────────┘  │  │Gateway││ │
│  │  └─────┘ │                  │  │x402   ││ │
│  └──────────┘                  │  └───────┘│ │
│                                │  ┌───────┐│ │
│                                │  │Wallets││ │
│                                │  └───────┘│ │
│                                │  ┌───────┐│ │
│                                │  │App Kit││ │
│                                │  │Send   ││ │
│                                └───────────┘ │
└──────────────────────────────────────────────┘
```

**Money model (B+ pooled architecture):**
- **Internal ledger** is the spend authority — fast, limit-enforced (`accounts.balance_micro_usdc`).
- Each account and publisher gets a **Circle developer-controlled wallet** on Arc Testnet.
- Users fund their balance via faucet credit or direct deposit to their Arc wallet.
- When the agent pays a citation, the **platform settlement wallet** (a single EOA) executes the x402 payment via Gateway. The user's ledger is debited.
- x402 settlement lands **real USDC in the publisher's wallet** on Arc. Publishers can withdraw via App Kit Send.
- A reconciliation layer ensures the settlement wallet balance is backed by ledger credits minus publisher payouts.

---

## Circle / Arc integration

CitationPay uses Wallets, Gateway, and App Kit together on Arc.

### Circle Wallets (developer-controlled)

Every account and every publisher gets a dev-controlled EOA wallet on Arc Testnet, created via the Circle Wallets API and secured by an entity secret. Wallets are created automatically on signup/publisher claim. Fallback mock wallets work in dev without Circle credentials.

**Usage:** create wallet (`POST /wallets`), read balance (viem `readContract` on USDC), sweep deposits to settlement.

### Gateway / x402 nanopayments

The core payment rail. CitationPay uses `@circle-fin/x402-batching` with the `GatewayClient` (buyer) and `BatchFacilitatorClient` (seller verify/settle).

- Buyers sign EIP-3009 offchain authorizations (zero gas).
- Gateway settles net positions in batches.
- Minimum payment: $0.000001 USDC.
- The `/api/sources/[id]/paid` endpoint serves 402 Payment Required responses with base64 `PAYMENT-REQUIRED` headers. The agent calls `payForSource` which uses `GatewayClient.pay()` to complete the flow.

### App Kit

**Send** (`@circle-fin/app-kit`) — publishers withdraw earnings to any Arc address. `kit.send({ from: {adapter, chain: "Arc_Testnet"}, to, amount, token: "USDC" })`. Mock fallback simulates the send when the real kit is unavailable (e.g., insufficient balance).

**Stretch:** Bridge for deposits from other chains.

### Stack summary

| Circle product | How CitationPay uses it |
|---|---|
| **Wallets** (dev-controlled) | Per-account + per-publisher EOA on Arc Testnet |
| **Gateway / x402** | Per-citation payment rail, gasless batched settlement |
| **App Kit · Send** | Publisher earnings withdrawal |
| **USDC** | Settlement currency on Arc |
| **Arc** | Native L1 chain, sub-500ms finality, USDC gas |
| **MCP · Streamable HTTP** | Agent-native surface, official `@modelcontextprotocol/sdk` |

---

## API reference

### Public endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/health` | `GET` | — | Config snapshot, facilitator check, database counts |
| `/api/dashboard` | `GET` | — | Aggregated statistics, proof of live citations |

### Auth endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/signup` | `POST` | — | Create Supabase auth user + CitationPay account + default API key |
| `/api/auth/login` | `POST` | — | Sign in, set cookie session |
| `/api/auth/logout` | `POST` | Session | Clear session |
| `/api/auth/me` | `GET` | Session | Current user info + account state |

### Account endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/account` | `GET` | Session/Bearer | Account state, wallet, API keys, wallet events |
| `/api/account/profile` | `GET` | Session/Bearer | Account + recent runs |
| `/api/account/api-keys` | `GET` | Session/Bearer | List API keys |
| `/api/account/api-keys` | `POST` | Session/Bearer | Mint new API key (returns one-time value) |
| `/api/account/api-keys?id=<id>` | `DELETE` | Session/Bearer | Revoke an API key |
| `/api/account/receipts` | `GET` | Session/Bearer | Settled citation receipts |

### Agent endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/agent/answer` | `POST` | Session/Bearer | Run a paid citation. Body: `{query, budgetUsd}` |
| `/api/mcp` | `POST` | Session/Bearer | MCP JSON-RPC endpoint (Streamable HTTP) |
| `/api/sources/[id]/paid` | `GET` | x402 | x402-gated paid source content |
| `/api/sources/[id]/preview` | `GET` | — | Free source preview |

### Wallet endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/wallets/deposit` | `POST` | Session/Bearer | Faucet credit (`mode: "faucet"`) or manual deposit (`mode: "deposit"`) |
| `/api/wallets/withdraw` | `POST` | Session/Bearer | Publisher earnings withdrawal via App Kit Send |

### Publisher endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/publishers/claim` | `GET` | Session/Bearer | List your claimed publishers |
| `/api/publishers/claim` | `POST` | Session/Bearer | Claim or create a new publisher |
| `/api/publishers/[id]/feeds` | `POST` | Session/Bearer | Import RSS/Atom feed as priced sources |
| `/api/publishers/[id]/earnings` | `GET` | Session/Bearer | Publisher earnings and receipts |

### Admin endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/publishers` | `POST` | `x-admin-token` | Create publisher (production-gated) |
| `/api/feeds/import` | `POST` | `x-admin-token` | Import RSS feed as priced sources |

---

## Environment

```bash
# App
NEXT_PUBLIC_APP_URL=https://your-app.example
PAYMENT_MODE=real

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ACCESS_TOKEN=...

# Circle Gateway x402
PLATFORM_SETTLEMENT_PRIVATE_KEY=0x...
PLATFORM_SETTLEMENT_ADDRESS=0x...
CIRCLE_FACILITATOR_URL=https://gateway-api-testnet.circle.com
ARC_TESTNET_NETWORK=eip155:5042002

# Circle Wallet API
ARC_RPC_URL=...
CIRCLE_API_KEY=...
CIRCLE_ENTITY_SECRET=...

# Circle App Kit
CIRCLE_KIT_KEY=...

# DGrid AI Gateway (optional — falls back to deterministic extractive answers)
DGRID_API_KEY=...
DGRID_MODEL=openai/gpt-4o
DGRID_BASE_URL=https://api.dgrid.ai/v1

# Admin
ADMIN_TOKEN=...

# Limits (in micro-USDC, 1 USDC = 1,000,000 micro)
TRIAL_CREDIT_MICRO_USDC=1000
DEFAULT_PER_RUN_LIMIT_MICRO_USDC=1000
DEFAULT_DAILY_LIMIT_MICRO_USDC=10000
MAX_PUBLIC_BUDGET_MICRO_USDC=1000
```

Backward-compatible aliases `BUYER_PRIVATE_KEY` and `BUYER_ADDRESS` still work locally, but new deployments should use the `PLATFORM_SETTLEMENT_*` names.

---

## Setup

```bash
# Install dependencies
pnpm install

# Copy environment
cp .env.example .env.local

# Run database migrations (requires SUPABASE_ACCESS_TOKEN)
pnpm tsx scripts/apply-migration.ts supabase/migrations/20260624000000_auth_and_wallets.sql

# Seed real publisher RSS feeds
pnpm seed

# Start dev server
pnpm dev
```

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 9
- Supabase project ([supabase.com](https://supabase.com))
- Circle API key + entity secret ([developers.circle.com](https://developers.circle.com))
- Arc RPC URL (contact Canteen team on Discord)
- DGrid API key optional (agent falls back to deterministic answers without it)

The app auto-detects available services and gracefully degrades (mock wallets, mock payments, extractive answers) when credentials are missing, so you can start building immediately.

---

## Verification

### Build & lint

```bash
pnpm lint          # ESLint — zero warnings
pnpm typecheck     # TypeScript — zero errors
pnpm build         # Next.js production build
```

### Runtime health

```bash
curl -sS http://localhost:3000/api/health
```

Response:

```json
{
  "ok": true,
  "paymentMode": "real",
  "supabaseConfigured": true,
  "circleWalletApiConfigured": true,
  "arcRpcConfigured": true,
  "dgridConfigured": true,
  "database": { "ok": true, "mode": "supabase", "accounts": 6, "publishers": 12, "sources": 80, "payments": 13 },
  "facilitator": { "ok": true }
}
```

### Signup & paid answer

```bash
# Sign up
curl -sS -c /tmp/ck.txt -X POST http://localhost:3000/api/auth/signup \
  -H 'content-type: application/json' \
  --data '{"email":"test@example.com","password":"test-pass-123","name":"Test User"}'

# Fund via faucet
curl -sS -b /tmp/ck.txt -X POST http://localhost:3000/api/wallets/deposit \
  -H 'content-type: application/json' \
  --data '{"mode":"faucet","amountUsd":"5.00"}'

# Run a paid citation
curl -sS -b /tmp/ck.txt -X POST http://localhost:3000/api/agent/answer \
  -H 'content-type: application/json' \
  --data '{"query":"What are nanopayments on Arc?","budgetUsd":0.001}'
```

### MCP smoke test

```bash
# Initialize
curl -sS -b /tmp/ck.txt -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'

# → note the mcp-session-id header

# List tools
curl -sS -b /tmp/ck.txt -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-session-id: <SESSION_ID>' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### Security guarantees

- No anonymous agent runs — every spend requires an authenticated session (cookie or API key).
- API keys hashed with SHA-256 (`citationpay:<key>`), never stored in plaintext.
- Per-run limit + daily spend limit enforced per account.
- Platform settlement private key never sent to client.
- Supabase RLS enforced on all tables; service-role key server-only.
- Origin validation on MCP endpoint (DNS rebinding mitigation per MCP spec).
- SSRF guard on RSS feed import (`assertPublicHttpUrl` + DNS resolution check).

---

## License

MIT
