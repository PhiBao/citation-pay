# CitationPay

CitationPay is a paid citation account for humans and agents. A user creates an account, receives trial USDC credit and an API key, then uses the web app or MCP endpoint to buy publisher citations through x402 and compose answers with DGrid.

The product thesis: AI agents need reliable source material, and publishers should earn when their work is used. CitationPay turns citation into a payable event with account-owned spend controls, receipts, and reusable paid-source cache.

## Product Flow

1. A user creates a CitationPay account.
2. The account receives trial credit or a funded balance.
3. The user runs a paid answer in the web app or gives their API key to an agent.
4. CitationPay searches priced publisher feeds.
5. The agent scores candidates and buys only selected citations.
6. Cached paid cards are reused at zero additional spend.
7. DGrid composes the answer from paid/cached cards.
8. The user sees receipts, spend, cache hits, and the decision ledger.

No anonymous request can spend real funds. The platform settlement wallet is infrastructure only; users and agents authenticate with CitationPay API keys and spend from account balances.

## User Surfaces

- `/` - self-serve account creation, API key display, account balance, MCP connection info, paid answer runner.
- `/api/accounts/signup` - create account and return one-time API key.
- `/api/account` - read current account state from `Authorization: Bearer <key>`.
- `/api/agent/answer` - authenticated paid answer endpoint.
- `/api/mcp` - MCP-style JSON-RPC endpoint for agent tools.
- `/api/dashboard` and `/api/health` - public proof and health surfaces.

## MCP Tools

`POST /api/mcp`

Use:

```text
Authorization: Bearer cp_live_...
Content-Type: application/json
```

Tools:

- `citationpay.search_sources`
- `citationpay.preview_citation`
- `citationpay.buy_citations`
- `citationpay.answer_with_paid_citations`
- `citationpay.get_receipts`

Example:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "citationpay.answer_with_paid_citations",
    "arguments": {
      "query": "What is changing in agent payments?",
      "budgetUsd": "0.001"
    }
  }
}
```

## Environment

```bash
NEXT_PUBLIC_APP_URL=https://your-app.example
PAYMENT_MODE=real

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

PLATFORM_SETTLEMENT_PRIVATE_KEY=0x...
PLATFORM_SETTLEMENT_ADDRESS=0x...
CIRCLE_FACILITATOR_URL=https://gateway-api-testnet.circle.com
ARC_TESTNET_NETWORK=eip155:5042002
ARC_RPC_URL=...

DGRID_API_KEY=...
DGRID_MODEL=openai/gpt-4o
DGRID_BASE_URL=https://api.dgrid.ai/v1

ADMIN_TOKEN=...
TRIAL_CREDIT_MICRO_USDC=1000
DEFAULT_PER_RUN_LIMIT_MICRO_USDC=1000
DEFAULT_DAILY_LIMIT_MICRO_USDC=10000
```

Backward-compatible aliases `BUYER_PRIVATE_KEY` and `BUYER_ADDRESS` still work locally, but new deployments should use the `PLATFORM_SETTLEMENT_*` names.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Runtime checks:

```bash
curl -sS http://localhost:3000/api/health
curl -sS -X POST http://localhost:3000/api/accounts/signup \
  -H 'content-type: application/json' \
  --data '{"name":"Agent User","email":"agent@example.com"}'
```

Security checks:

- `POST /api/agent/answer` without an API key returns `401`.
- MCP `tools/call` without an API key returns an auth error.
- Account spend cannot exceed balance or per-run limit.
- Publisher/feed setup remains protected by `ADMIN_TOKEN` in production.

## Supabase Keepalive

`.github/workflows/supabase-keepalive.yml` queries Supabase every three days. Configure:

```text
SUPABASE_URL=https://gcwqsrqvezkapzkotfrn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```
