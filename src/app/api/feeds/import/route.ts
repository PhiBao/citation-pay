import { z } from "zod";
import { getStore } from "@/lib/db";
import { importRssFeed } from "@/lib/rss";

const schema = z.object({
  publisherId: z.string().uuid(),
  url: z.string().url()
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message || "Invalid feed import" }, { status: 400 });
    }

    const store = getStore();
    const publishers = await store.listPublishers();
    const publisher = publishers.find((item) => item.id === parsed.data.publisherId);
    if (!publisher) {
      return Response.json({ error: "Publisher not found" }, { status: 404 });
    }

    const imported = await importRssFeed(parsed.data.url);
    const feed = await store.upsertFeed({
      publisher_id: publisher.id,
      url: parsed.data.url,
      title: imported.title
    });

    const sources = await store.upsertSources(
      imported.items.map((item) => ({
        publisher_id: publisher.id,
        feed_id: feed.id,
        title: item.title,
        canonical_url: item.canonicalUrl,
        excerpt: item.excerpt,
        content_hash: item.contentHash,
        price_micro_usdc: publisher.default_price_micro_usdc,
        published_at: item.publishedAt,
        search_text: `${item.title} ${item.excerpt} ${publisher.name}`
      }))
    );

    return Response.json({ feed, imported: sources.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feed import failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
