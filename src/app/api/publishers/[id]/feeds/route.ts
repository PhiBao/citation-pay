import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/accounts";
import { getStore } from "@/lib/db";
import { importRssFeed } from "@/lib/rss";
import { formatMicroUsdc } from "@/lib/price";

const schema = z.object({
  feedUrl: z.string().url(),
  priceUsd: z.string().optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request);
    const { id } = await params;
    const store = getStore();
    const publisher = await store.getPublisher(id);
    if (!publisher) return NextResponse.json({ error: "Publisher not found" }, { status: 404 });
    if (publisher.supabase_user_id && publisher.supabase_user_id !== session.account.supabase_user_id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const priceUsd = parsed.data.priceUsd ? Number(parsed.data.priceUsd) : publisher.default_price_micro_usdc / 1_000_000;
    const priceMicro = Math.round(priceUsd * 1_000_000);
    const imported = await importRssFeed(parsed.data.feedUrl);
    const feed = await store.upsertFeed({ publisher_id: publisher.id, url: parsed.data.feedUrl, title: imported.title });
    const result = await store.replaceFeedSources(feed.id, publisher.id, priceMicro, imported.items);
    return NextResponse.json({
      feed: result.feed,
      imported: result.inserted,
      title: imported.title,
      pricePerCitation: formatMicroUsdc(priceMicro)
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 500 });
  }
}
