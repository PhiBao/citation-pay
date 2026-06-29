# CitationPay

Paid citations for AI agents on Arc. Built on Mastodon — 50,000+ instances, 15 million+ users.

**Product thesis:** AI agents consume publisher work as free substrate. CitationPay makes citation a **payable event** — an agent autonomously decides which sources are worth paying for, pays per-citation via x402 nanopayments on Arc, and the publisher earns the moment their work is used.

**Distribution thesis:** CitationPay attaches nanopayments to communities that already exist. Import any Mastodon instance as priced sources — every creator on the fediverse earns USDC when an agent cites their work. RSS feeds, Ghost newsletters, and PeerTube channels follow the same pattern.

Built for the [Lepton Agents Hackathon](https://lepton.thecanteenapp.com) (Canteen × Circle × Arc, Jun 2026).

---

## Table of contents

- [How it works](#how-it-works)
- [Distribution](#distribution)
- [Quick start](#quick-start)
- [User guide](#user-guide)
  - [Create an account](#1-create-an-account)
  - [Fund your balance](#2-fund-your-balance)
  - [Run a paid citation](#3-run-a-paid-citation)
  - [Import from Mastodon](#4-import-from-mastodon)
  - [Connect an MCP client](#5-connect-an-mcp-client)
  - [Become a publisher](#6-become-a-publisher)
- [MCP server](#mcp-server)
- [Architecture](#architecture)
- [Circle / Arc integration](#circle--arc-integration)
- [API reference](#api-reference)
- [Environment](#environment)
- [Setup](#setup)
- [Deployment](#deployment)
- [Verification](#verification)

---

## How it works

```
Mastodon instance         CitationPay                   AI Agent
     │                        │                             │
     ├── public posts ───────►│                             │
     │  (priced sources)      ├─ search 249+ sources        │
     │                        ├─ LLM cost/benefit reason    │
     │                        ├─ select ≤4 citations        │
     │                        ├─ pay via x402 (Arc) ───────►│
     │                        │  Gateway batched, <500ms    │  USDC from
     │                        ├─ cache content hash         │  agent balance
     │                        ├─ compose cited answer       │
     │                        │                             │
     │◄── USDC settlement ────┤                             │
     │  (creator's wallet)    │                             │
```

1. **Import** — connect a Mastodon instance or RSS feed. Public posts become priced sources with a per-citation price.
2. **Search** — the agent finds candidate sources.
3. **Reason** — an LLM cost/benefit step evaluates each source against the query and budget. The agent decides `pay` or `skip`.
4. **Pay** — selected citations are paid via x402 nanopayments. Gasless, sub-cent, settled on Arc in under a second.
5. **Cache** — previously paid content is reused for free.
6. **Compose** — paid/cached cards are assembled into a cited answer.
7. **Settle** — the creator's Arc wallet receives USDC. Withdraw via App Kit Send.

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
| Seeded sources | 249 from 9 real RSS feeds + Mastodon imports |

---

## Distribution

The hard part of a payments product is finding the people. CitationPay attaches nanopayments to communities that are already gathered.

### Mastodon — 50k instances, 15M users

The primary distribution channel. Import any Mastodon instance's public posts as priced sources. Every creator earns USDC when an agent cites their work. Zero-config — no plugin, no server change, just the public Mastodon API.

Visit `/mastodon` to import an instance. Compatible with any ActivityPub server (Mastodon, Pleroma, Akkoma, GoToSocial).

### RSS / Ghost / newsletters

Paste an RSS feed URL on `/publish`. Posts become priced sources. Works with Ghost, WordPress, Substack, and any RSS-producing platform.

### Roadmap

- **Ghost plugin** (54k stars) — on-subscribe payment for paid newsletters
- **RSSHub plugin** (44k stars) — citation-toll layer on the feed generator
- **PeerTube plugin** (15k stars) — per-view payments for video creators
- **Owncast sidecar** (11k stars) — per-second streaming payments

---

## Quick start

```bash
pnpm install
cp .env.example .env.local
# Fill in your Supabase and Circle credentials
pnpm seed     # Imports 9 real RSS feeds + curated x402/AgentKit docs
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

Navigate to `/app/deposit`. Arc-native — fund your balance directly on Arc Testnet. Click "Credit from faucet" for instant credit, or send USDC to your Arc wallet address and paste the tx hash.

Your Arc wallet address is visible on the account page (`/app`) and deposit page (`/app/deposit`).

### 3. Run a paid citation

Go to `/app/playground`. Enter a research query and a max spend. Click "Run paid answer."

The agent searches sources from seeded RSS feeds, curated official docs, and Mastodon imports. It invokes a bounded LLM cost/benefit step when available, falls back to deterministic scoring/composition when DGrid is slow, pays per citation via x402 on Arc, and composes a cited answer. The decision ledger shows why the AI paid or skipped each source. Cache hits are free.

### 4. Import from Mastodon

Go to `/mastodon`. Paste any Mastodon instance URL (e.g., `fosstodon.org`). Choose public timeline or hashtag mode. Set a per-citation price. Click "Import."

CitationPay fetches public posts via the Mastodon API and registers each post as a priced source. Post authors become publishers. When an AI agent cites those posts, the authors earn USDC on Arc. No plugin install, no server-side change — it uses the public Mastodon API.

Featured instances pre-loaded: mastodon.social, fosstodon.org, hachyderm.io, mstdn.social, indieweb.social.

### 5. Connect an MCP client

CitationPay exposes a Model Context Protocol server at `/api/mcp`. From the web: visit `/app/mcp` to browse tools, test them interactively, and copy a ready-to-paste MCP config.

**Claude Desktop config:**

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

Six tools: `search_sources`, `preview_citation`, `buy_citations`, `answer_with_paid_citations`, `get_receipts`, `list_sources`.

### 6. Become a publisher

Visit `/publish`. Claim a publisher identity, import an RSS feed, set a per-citation price. Your dashboard (`/publish/[id]`) shows total citations, USDC earned, per-source receipts, and withdrawal via App Kit Send to any address.

---

## MCP server

Six tools registered. Stateless JSON-RPC 2.0 over HTTP — works on serverless platforms (Vercel) and persistent servers (Render).

| Tool | Description |
|---|---|
| `search_sources` | Search priced publisher sources by free-text query. |
| `preview_citation` | Read a free preview of a priced source (no payment required). |
| `buy_citations` | Pay for citations by spending the account's USDC balance via x402 on Arc. |
| `answer_with_paid_citations` | Run the full agent loop: search, score, pay, compose answer. |
| `get_receipts` | Return recent settled citation receipts for the authenticated account. |
| `list_sources` | List the priced source market (most recently imported first). |

**Example — initialize and call a tool:**

```bash
# Initialize
curl -sS -X POST https://lepton.thecanteenapp.com/api/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer cp_live_YOUR_KEY' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1"}}}'

# Call a tool
curl -sS -X POST https://lepton.thecanteenapp.com/api/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer cp_live_YOUR_KEY' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_sources","arguments":{"query":"nanopayments","limit":5}}}'
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     CitationPay                         │
│                                                         │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  Next.js   │  │  Supabase    │  │  Circle / Arc    │ │
│  │  App       │  │  (accounts,  │  │  (wallets, x402, │ │
│  │  Router    │  │  sources,    │  │  App Kit, USDC)  │ │
│  │            │  │  payments,   │  │                  │ │
│  │  ┌──────┐  │  │  ledger,     │  │  ┌─────────────┐ │ │
│  │  │ MCP  │  │  │  publishers) │  │  │ Gateway x402│ │ │
│  │  │JSON- │  │  │              │  │  │ (batched)   │ │ │
│  │  │RPC   │  │  │              │  │  └─────────────┘ │ │
│  │  └──────┘  │  │              │  │  ┌─────────────┐ │ │
│  │  ┌──────┐  │  │              │  │  │Wallets (dev │ │ │
│  │  │Mast. │  │  │              │  │  │-controlled) │ │ │
│  │  │API   │  │  │              │  │  └─────────────┘ │ │
│  │  │client│  │  │              │  │  ┌─────────────┐ │ │
│  │  └──────┘  │  │              │  │  │App Kit Send │ │ │
│  └────────────┘  └──────────────┘  └──────────────────┘ │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Mastodon sidecar                                  │ │
│  │  • Public API fetch (no auth)                      │ │
│  │  • Timeline + hashtag search                       │ │
│  │  • Per-author publisher registration               │ │
│  │  • x402 price assignment                           │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Money model (B+ pooled architecture):**
- **Internal ledger** is the spend authority — fast, limit-enforced.
- Each account and publisher gets a **Circle developer-controlled wallet** on Arc Testnet.
- Users fund via faucet credit or direct Arc deposit.
- The platform settlement wallet executes x402 payments. User ledger is debited.
- x402 settlement lands **USDC in the publisher's wallet**. Publishers withdraw via App Kit Send.
- Mastodon-post authors become publishers with per-citation prices.

---

## Circle / Arc integration

### Circle Wallets (developer-controlled)

Every account and publisher gets an EOA wallet on Arc Testnet via the Circle Wallets API. Created on signup or publisher claim.

### Gateway / x402 nanopayments

Core payment rail. `@circle-fin/x402-batching` with `GatewayClient` (buyer) + `BatchFacilitatorClient` (seller). Gasless, batched, sub-cent settlement.

### App Kit · Send

Publisher earnings withdrawal on Arc. `kit.send({ chain: "Arc_Testnet", to, amount, token: "USDC" })`.

### Stack summary

| Circle product | Usage |
|---|---|
| **Wallets** (dev-controlled) | Per-account + per-publisher EOA on Arc Testnet |
| **Gateway / x402** | Per-citation payment rail |
| **App Kit · Send** | Publisher earnings withdrawal |
| **USDC** | Settlement currency on Arc |
| **Arc** | Native L1, <500ms finality, USDC gas |

---

## API reference

### Public endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Config snapshot, facilitator check, database counts |
| `/api/dashboard` | `GET` | Aggregated statistics, live proof of citations |

### Auth endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/signup` | `POST` | — | Create user + CitationPay account + default API key |
| `/api/auth/login` | `POST` | — | Sign in, set cookie session |
| `/api/auth/logout` | `POST` | Session | Clear session |
| `/api/auth/me` | `GET` | Session | Current user + account state |

### Account endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/account` | `GET` | Session/Bearer | Account state, wallet, API keys, wallet events |
| `/api/account/api-keys` | `GET` | Session/Bearer | List API keys |
| `/api/account/api-keys` | `POST` | Session/Bearer | Mint new API key |
| `/api/account/api-keys?id=<id>` | `DELETE` | Session/Bearer | Revoke API key |
| `/api/account/receipts` | `GET` | Session/Bearer | Settled citation receipts |

### Agent endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/agent/answer` | `POST` | Session/Bearer | Run a paid citation |
| `/api/mcp` | `POST` | Session/Bearer | MCP JSON-RPC endpoint (stateless) |
| `/api/sources/[id]/paid` | `GET` | x402 | x402-gated paid source content |
| `/api/sources/[id]/preview` | `GET` | — | Free source preview |

### Mastodon endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/mastodon/info?instance=...` | `GET` | — | Instance info check |
| `/api/mastodon/import` | `POST` | Session/Bearer | Import Mastodon posts as priced sources |

### Wallet endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/wallets/deposit` | `POST` | Session/Bearer | Faucet credit or manual Arc deposit |
| `/api/wallets/withdraw` | `POST` | Session/Bearer | Publisher withdrawal via App Kit Send |

### Publisher endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/publishers/claim` | `GET`/`POST` | Session/Bearer | List or claim publishers |
| `/api/publishers/[id]/feeds` | `POST` | Session/Bearer | Import RSS feed |
| `/api/publishers/[id]/earnings` | `GET` | Session/Bearer | Publisher earnings and receipts |

### Admin endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/publishers` | `POST` | `x-admin-token` | Create publisher (production-gated) |
| `/api/feeds/import` | `POST` | `x-admin-token` | Import RSS feed |

---

## Environment

```bash
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

# DGrid AI Gateway (optional)
DGRID_API_KEY=...
DGRID_MODEL=openai/gpt-4o
DGRID_BASE_URL=https://api.dgrid.ai/v1
DGRID_DECISION_TIMEOUT_MS=5500
DGRID_COMPOSE_TIMEOUT_MS=8000

# Admin
ADMIN_TOKEN=...

# Limits (micro-USDC)
TRIAL_CREDIT_MICRO_USDC=1000
DEFAULT_PER_RUN_LIMIT_MICRO_USDC=1000
DEFAULT_DAILY_LIMIT_MICRO_USDC=10000
MAX_PUBLIC_BUDGET_MICRO_USDC=1000
```

---

## Setup

```bash
pnpm install
cp .env.example .env.local

# Run database migrations (requires SUPABASE_ACCESS_TOKEN)
pnpm tsx scripts/apply-migration.ts supabase/migrations/20260624000000_auth_and_wallets.sql

# Seed real publisher RSS feeds plus curated official x402/AgentKit docs
pnpm seed

# Or only backfill the curated docs for an existing deployment
pnpm seed:curated

pnpm dev
```

### Prerequisites

- Node.js ≥ 18, pnpm ≥ 9
- Supabase project
- Circle API key + entity secret
- Arc RPC URL
- DGrid API key (optional)

The app auto-detects available services and gracefully degrades when credentials are missing.

---

## Deployment

### Vercel (web app + API)

`vercel.json` is pre-configured. The agent answer route exports `maxDuration = 60` and bounds each DGrid stage so Vercel should return a structured fallback/no-coverage result instead of a raw function timeout. The MCP endpoint is stateless — no session persistence needed. Key config:

```json
{
  "installCommand": "pnpm install --frozen-lockfile --ignore-scripts",
  "buildCommand": "pnpm rebuild sharp unrs-resolver && pnpm build",
  "framework": "nextjs"
}
```

`--ignore-scripts` avoids pnpm ignored-build errors on Vercel. `pnpm rebuild sharp` ensures Next.js image optimization works.

### Render / Railway (for persistent MCP)

For a persistent MCP server with session support, deploy to Render or Railway as a standard Node.js service (`pnpm start`). The full MCP SDK with session management is available in `src/lib/mcp/server.ts`.

---

## Verification

```bash
pnpm lint          # ESLint — zero warnings
pnpm typecheck     # TypeScript — zero errors
pnpm build         # Next.js production build
```

**Runtime health:**
```bash
curl -sS http://localhost:3000/api/health
```

**Signup + paid answer:**
```bash
curl -sS -c /tmp/ck.txt -X POST http://localhost:3000/api/auth/signup \
  -H 'content-type: application/json' \
  --data '{"email":"test@example.com","password":"test-pass-123","name":"Test User"}'

curl -sS -b /tmp/ck.txt -X POST http://localhost:3000/api/wallets/deposit \
  -H 'content-type: application/json' \
  --data '{"mode":"faucet","amountUsd":"5.00"}'

curl -sS -b /tmp/ck.txt -X POST http://localhost:3000/api/agent/answer \
  -H 'content-type: application/json' \
  --data '{"query":"What are nanopayments on Arc?","budgetUsd":0.001}'
```

**MCP:**
```bash
curl -sS -b /tmp/ck.txt -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

---

## License

MIT
