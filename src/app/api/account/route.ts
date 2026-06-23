import { requireSession, serializeAccount } from "@/lib/accounts";
import { getStore } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const store = getStore();
    const keys = await store.listAccountApiKeys(session.account.id);
    const walletEvents = await store.listWalletEventsForAccount(session.account.id, 8);
    return Response.json({
      account: serializeAccount(session.account),
      apiKey: {
        id: session.apiKey.id,
        name: session.apiKey.name,
        prefix: session.apiKey.key_prefix,
        lastUsedAt: session.apiKey.last_used_at
      },
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        lastUsedAt: k.last_used_at,
        createdAt: k.created_at
      })),
      walletEvents
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account lookup failed";
    return Response.json({ error: message }, { status: 401 });
  }
}
