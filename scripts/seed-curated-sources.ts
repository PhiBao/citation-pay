import { config as loadEnv } from "dotenv";
import { pathToFileURL } from "node:url";
import { getStore } from "../src/lib/db";
import { sha256 } from "../src/lib/crypto";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

type CuratedPublisher = {
  name: string;
  wallet: string;
  priceMicroUsdc: number;
  feed: {
    title: string;
    url: string;
  };
  sources: Array<{
    title: string;
    canonicalUrl: string;
    excerpt: string;
    keywords: string[];
  }>;
};

const CURATED_PUBLISHERS: CuratedPublisher[] = [
  {
    name: "Circle Gateway Docs",
    wallet: "0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1",
    priceMicroUsdc: 100,
    feed: {
      title: "Circle Gateway and Agent Nanopayments",
      url: "https://developers.circle.com/llms.txt#gateway-nanopayments"
    },
    sources: [
      {
        title: "Circle Gateway Nanopayments",
        canonicalUrl: "https://developers.circle.com/gateway/nanopayments",
        excerpt:
          "Circle Gateway nanopayments support gas-free, batched USDC payments at sub-cent scale for usage-priced APIs, AI agent payments, compute, data, and storage.",
        keywords: ["circle", "gateway", "nanopayments", "x402", "usdc", "sub-cent", "agent payments", "machine payments"]
      },
      {
        title: "Circle x402 Protocol Concept",
        canonicalUrl: "https://developers.circle.com/gateway/nanopayments/concepts/x402",
        excerpt:
          "Circle documents x402 as an HTTP-native payment protocol around 402 Payment Required: sellers declare requirements, agents sign payment payloads, and Gateway facilitates settlement.",
        keywords: ["x402", "http 402", "payment required", "payment payload", "authorization", "settlement", "facilitator"]
      },
      {
        title: "Circle Agent Nanopayments",
        canonicalUrl: "https://developers.circle.com/agent-stack/agent-nanopayments",
        excerpt:
          "Circle Agent Nanopayments let AI agents hold a Gateway balance, discover x402-compatible services, and pay per request with batched USDC settlement.",
        keywords: ["agent", "agents", "nanopayments", "gateway balance", "x402 services", "batched settlement", "usdc"]
      },
      {
        title: "Circle Developer-Controlled Wallets",
        canonicalUrl: "https://developers.circle.com/wallets/dev-controlled",
        excerpt:
          "Circle developer-controlled wallets are server-side programmable wallets for applications that need to create wallets, custody operational funds, and automate transactions.",
        keywords: ["circle", "developer-controlled wallets", "wallets", "custody", "automation", "server-side", "agent wallets"]
      }
    ]
  },
  {
    name: "Coinbase CDP Docs",
    wallet: "0xc2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2",
    priceMicroUsdc: 100,
    feed: {
      title: "Coinbase CDP Agent Payments",
      url: "https://docs.cdp.coinbase.com/llms.txt#agent-payments"
    },
    sources: [
      {
        title: "Coinbase x402 Welcome",
        canonicalUrl: "https://docs.cdp.coinbase.com/x402/welcome",
        excerpt:
          "Coinbase CDP presents x402 as HTTP-native payments for monetizing APIs and resources, allowing agents and apps to pay for protected services.",
        keywords: ["coinbase", "cdp", "x402", "http payments", "monetizing APIs", "payment required", "agents"]
      },
      {
        title: "Coinbase AgentKit Welcome",
        canonicalUrl: "https://docs.cdp.coinbase.com/agent-kit/welcome",
        excerpt:
          "AgentKit helps developers build AI agents that use CDP tools and wallet actions, giving agents a practical interface for onchain workflows.",
        keywords: ["agentkit", "agent kit", "coinbase", "cdp", "wallet actions", "onchain agents", "ai agents"]
      },
      {
        title: "Coinbase AgentKit Wallet Management",
        canonicalUrl: "https://docs.cdp.coinbase.com/agent-kit/core-concepts/wallet-management",
        excerpt:
          "AgentKit wallet management covers how agents use wallets through CDP-backed tooling, which is a different product shape from Circle developer-controlled wallets.",
        keywords: ["agentkit", "wallet management", "coinbase", "cdp", "wallets", "developer-controlled wallets", "agent wallet"]
      },
      {
        title: "Coinbase Agentic Wallet",
        canonicalUrl: "https://docs.cdp.coinbase.com/agentic-wallet/welcome",
        excerpt:
          "Coinbase Agentic Wallet is wallet infrastructure for autonomous AI agent workflows, including agent-ready wallet setup and x402 service payment patterns.",
        keywords: ["agentic wallet", "coinbase", "wallet", "autonomous agents", "x402", "agent payments", "mcp"]
      }
    ]
  }
];

export async function seedCuratedSources() {
  const store = getStore();
  const stats = {
    publishers: 0,
    feeds: 0,
    sources: 0
  };

  for (const seed of CURATED_PUBLISHERS) {
    const publisher = await findOrCreatePublisher(seed);
    stats.publishers += 1;

    const feed = await store.upsertFeed({
      publisher_id: publisher.id,
      url: seed.feed.url,
      title: seed.feed.title
    });
    stats.feeds += 1;

    const sources = await store.upsertSources(
      seed.sources.map((source) => ({
        publisher_id: publisher.id,
        feed_id: feed.id,
        title: source.title,
        canonical_url: source.canonicalUrl,
        excerpt: source.excerpt,
        content_hash: sha256(`curated:${source.canonicalUrl}`),
        price_micro_usdc: seed.priceMicroUsdc,
        published_at: null,
        search_text: `${source.title} ${source.excerpt} ${source.keywords.join(" ")} ${publisher.name}`
      }))
    );
    stats.sources += sources.length;
    console.log(`curated ${publisher.name}: ${sources.length} sources at ${seed.priceMicroUsdc} micro-USDC each`);
  }

  return stats;
}

async function findOrCreatePublisher(p: CuratedPublisher) {
  const store = getStore();
  const existing = (await store.listPublishers()).find((row) => row.name === p.name);
  if (existing) return existing;
  return store.createPublisher({
    name: p.name,
    wallet_address: p.wallet,
    default_price_micro_usdc: p.priceMicroUsdc,
    verified: true
  });
}

async function main() {
  const stats = await seedCuratedSources();
  console.log("\ncurated seed complete");
  console.log(JSON.stringify(stats, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
