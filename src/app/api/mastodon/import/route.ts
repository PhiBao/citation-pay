import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/accounts";
import { getStore } from "@/lib/db";
import { fetchPublicTimeline, searchHashtag, getInstanceInfo, parseInstanceUrl } from "@/lib/mastodon";
import { formatMicroUsdc } from "@/lib/price";

const schema = z.object({
  instanceUrl: z.string().min(3).max(200),
  mode: z.enum(["public", "hashtag"]).default("public"),
  hashtag: z.string().optional(),
  priceUsd: z.string().default("0.001"),
  limit: z.number().int().min(1).max(40).default(20)
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
    }

    const instance = await getInstanceInfo(parsed.data.instanceUrl);
    const { host } = parseInstanceUrl(parsed.data.instanceUrl);

    // Fetch posts from the Mastodon instance
    let posts;
    if (parsed.data.mode === "hashtag" && parsed.data.hashtag) {
      posts = await searchHashtag(parsed.data.instanceUrl, parsed.data.hashtag, parsed.data.limit);
    } else {
      posts = await fetchPublicTimeline(parsed.data.instanceUrl, parsed.data.limit);
    }

    if (posts.length === 0) {
      return NextResponse.json({
        instance: { title: instance.title, host, users: instance.stats.user_count, statuses: instance.stats.status_count },
        imported: 0,
        posts: []
      });
    }

    const store = getStore();
    const priceUsd = Number(parsed.data.priceUsd);
    const priceMicro = Number.isFinite(priceUsd) && priceUsd > 0 ? Math.round(priceUsd * 1_000_000) : 1000;

    // Find or create a publisher for this Mastodon instance
    let publisher = (await store.listPublishers()).find(
      (p) => p.name === `mastodon:${host}` || p.name === instance.title
    );
    if (!publisher) {
      publisher = await store.createPublisher({
        name: `mastodon:${host}`,
        wallet_address: `0x${"0".repeat(40)}`, // placeholder — instance admin sets real wallet
        default_price_micro_usdc: priceMicro,
        supabase_user_id: session.account.supabase_user_id,
        verified: false
      });
    }

    // Register posts as priced sources — one per Mastodon account as a publisher
    const results: Array<{ author: string; posts: number; price: string }> = [];
    const seenAuthors = new Set<string>();
    let totalImported = 0;

    // Group posts by author to create per-author publishers
    const byAuthor = new Map<string, typeof posts>();
    for (const post of posts) {
      const key = post.account.acct;
      if (!byAuthor.has(key)) byAuthor.set(key, []);
      byAuthor.get(key)!.push(post);
    }

    for (const [acct, authorPosts] of byAuthor) {
      let authorPublisher = (await store.listPublishers()).find(
        (p) => p.name === acct || p.name === `@${acct}`
      );
      if (!authorPublisher) {
        authorPublisher = await store.createPublisher({
          name: acct,
          wallet_address: `0x${"0".repeat(40)}`, // placeholder — author verifies wallet later
          default_price_micro_usdc: priceMicro,
          supabase_user_id: null,
          verified: false
        });
      }

      // Upsert feed for this author on this instance
      const feed = await store.upsertFeed({
        publisher_id: authorPublisher.id,
        url: `mastodon://${host}/${authorPosts[0].account.id}`,
        title: `${acct} on ${host}`
      });

      const items = authorPosts.map((p) => ({
        title: `${p.account.display_name}: ${p.textContent.slice(0, 80)}`,
        canonicalUrl: p.url,
        excerpt: p.textContent,
        contentHash: p.citationsHash,
        publishedAt: p.created_at
      }));

      await store.replaceFeedSources(feed.id, authorPublisher.id, priceMicro, items);
      totalImported += authorPosts.length;
      results.push({ author: acct, posts: authorPosts.length, price: formatMicroUsdc(priceMicro) });
      seenAuthors.add(acct);
    }

    return NextResponse.json({
      instance: { title: instance.title, host, users: instance.stats.user_count, statuses: instance.stats.status_count },
      imported: totalImported,
      authors: results.length,
      details: results
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Mastodon import failed" },
      { status: 500 }
    );
  }
}
