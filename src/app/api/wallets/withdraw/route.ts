import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/accounts";
import { getStore } from "@/lib/db";
import { withdrawPublisher } from "@/lib/appkit/appkit";

const schema = z.object({
  publisherId: z.string().uuid(),
  toAddress: z.string().min(40).max(60),
  amountUsd: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    // The session must own the publisher.
    const store = getStore();
    const publisher = await store.getPublisher(parsed.data.publisherId);
    if (!publisher) return NextResponse.json({ error: "Publisher not found" }, { status: 404 });
    if (publisher.supabase_user_id && publisher.supabase_user_id !== session.account.supabase_user_id) {
      return NextResponse.json({ error: "Not authorized for this publisher" }, { status: 403 });
    }
    const result = await withdrawPublisher({
      publisherId: parsed.data.publisherId,
      toAddress: parsed.data.toAddress,
      amountUsd: parsed.data.amountUsd
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Withdrawal failed" }, { status: 500 });
  }
}
