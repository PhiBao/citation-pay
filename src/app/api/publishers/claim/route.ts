import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/accounts";
import { getStore } from "@/lib/db";

import { randomToken } from "@/lib/crypto";

const schema = z.object({
  publisherName: z.string().min(2).max(80),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  basePriceUsd: z.string().optional()
});

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const store = getStore();
    const publishers = await store.listPublishersBySupabaseUser(session.account.supabase_user_id || "");
    return NextResponse.json({ publishers });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const store = getStore();
    const priceUsd = Number(parsed.data.basePriceUsd || "0.001");
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }
    const micro = Math.round(priceUsd * 1_000_000);
    const publisher = await store.createPublisher({
      name: parsed.data.publisherName,
      wallet_address: parsed.data.walletAddress,
      default_price_micro_usdc: micro,
      supabase_user_id: session.account.supabase_user_id,
      verified: false
    });
    const challenge = `citationpay-claim:${randomToken(24)}`;
    await store.claimPublisher(
      publisher.id,
      session.account.supabase_user_id || "",
      parsed.data.walletAddress,
      challenge,
      "pending"
    );
    return NextResponse.json({ publisher, challenge });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
