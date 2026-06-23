/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";
import { importRssFeed } from "../src/lib/rss";
import { getStore } from "../src/lib/db";
import { randomToken, sha256 } from "../src/lib/crypto";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

type SeedPublisher = {
  name: string;
  wallet: string;
  defaultPriceUsd: number;
  feeds: string[];
};

const SEED_PUBLISHERS: SeedPublisher[] = [
  {
    name: "Canteen",
    wallet: "0x3333333333333333333333333333333333333333",
    defaultPriceUsd: 0.002,
    feeds: ["https://thecanteenapp.com/feed.xml"]
  },
  {
    name: "Vitalik Buterin",
    wallet: "0x4444444444444444444444444444444444444444",
    defaultPriceUsd: 0.005,
    feeds: ["https://vitalik.eth.limo/feed.xml"]
  },
  {
    name: "Ethereum Foundation",
    wallet: "0x5555555555555555555555555555555555555555",
    defaultPriceUsd: 0.001,
    feeds: ["https://blog.ethereum.org/en/feed.xml"]
  },
  {
    name: "AWS Machine Learning",
    wallet: "0x6666666666666666666666666666666666666666",
    defaultPriceUsd: 0.003,
    feeds: ["https://aws.amazon.com/about-aws/whats-new/recent/feed/"]
  },
  {
    name: "Hugging Face",
    wallet: "0x7777777777777777777777777777777777777777",
    defaultPriceUsd: 0.002,
    feeds: ["https://huggingface.co/blog/feed.xml"]
  },
  {
    name: "The Pragmatic Engineer",
    wallet: "0x8888888888888888888888888888888888888888",
    defaultPriceUsd: 0.01,
    feeds: ["https://newsletter.pragmaticengineer.com/feed"]
  },
  {
    name: "Simon Willison",
    wallet: "0x9999999999999999999999999999999999999999",
    defaultPriceUsd: 0.005,
    feeds: ["https://simonwillison.net/atom/everything/"]
  },
  {
    name: "Cloudflare Blog",
    wallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    defaultPriceUsd: 0.002,
    feeds: ["https://blog.cloudflare.com/rss/"]
  },
  {
    name: "Stripe News",
    wallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    defaultPriceUsd: 0.003,
    feeds: ["https://stripe.com/blog/feed.rss"]
  }
];

const usdToMicro = (usd: number) => Math.max(1, Math.round(usd * 1_000_000));

function ownerTokenFor(name: string) {
  return sha256(`seed:${name}:${process.env.ADMIN_TOKEN || "anonymous"}`);
}
void ownerTokenFor;

async function findOrCreatePublisher(p: SeedPublisher) {
  const store = getStore();
  const existing = (await store.listPublishers()).find((row) => row.name === p.name);
  if (existing) {
    return existing;
  }
  return store.createPublisher({
    name: p.name,
    wallet_address: p.wallet,
    default_price_micro_usdc: usdToMicro(p.defaultPriceUsd)
  });
}

async function main() {
  const store = getStore();
  const stats = {
    publishers: 0,
    feeds: 0,
    sources: 0,
    failed: [] as Array<{ publisher: string; feed: string; error: string }>
  };

  for (const seed of SEED_PUBLISHERS) {
    const publisher = await findOrCreatePublisher(seed);
    stats.publishers += 1;
    console.log(`publisher ${publisher.name} (${publisher.id}) wallet=${publisher.wallet_address}`);

    for (const feedUrl of seed.feeds) {
      try {
        const imported = await importRssFeed(feedUrl);
        const feed = await store.upsertFeed({
          publisher_id: publisher.id,
          url: feedUrl,
          title: imported.title
        });
        const result = await store.replaceFeedSources(feed.id, publisher.id, publisher.default_price_micro_usdc, imported.items);
        stats.feeds += 1;
        stats.sources += result.inserted;
        console.log(`  feed ${feedUrl} -> ${imported.items.length} items (inserted ${result.inserted})`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stats.failed.push({ publisher: seed.name, feed: feedUrl, error: message });
        console.log(`  feed ${feedUrl} FAILED: ${message}`);
      }
    }
  }

  console.log("\nseed complete");
  console.log(JSON.stringify(stats, null, 2));
  if (stats.failed.length > 0) {
    console.log("Some feeds failed; they can be retried once their host is reachable.");
  }
  // Touch randomToken to keep import side-effect on Tree-shaking.
  void randomToken;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
