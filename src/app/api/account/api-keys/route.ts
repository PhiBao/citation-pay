import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/accounts";
import { getStore } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";

const createSchema = z.object({
  name: z.string().min(2).max(80)
});

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const store = getStore();
    const keys = await store.listAccountApiKeys(session.account.id);
    return NextResponse.json({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        lastUsedAt: k.last_used_at,
        createdAt: k.created_at
      }))
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const store = getStore();
    const key = `cp_live_${randomToken(24)}`;
    const apiKey = await store.createAccountApiKey({
      account_id: session.account.id,
      name: parsed.data.name,
      key_prefix: key.slice(0, 12),
      key_hash: sha256(`citationpay:${key}`)
    });
    return NextResponse.json({
      key: { id: apiKey.id, name: apiKey.name, prefix: apiKey.key_prefix, value: key }
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const store = getStore();
    await store.revokeAccountApiKey(id, session.account.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
