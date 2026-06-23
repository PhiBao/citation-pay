import { requireAccountSession, serializeAccount } from "@/lib/accounts";

export async function GET(request: Request) {
  try {
    const session = await requireAccountSession(request);
    return Response.json({
      account: serializeAccount(session.account),
      apiKey: {
        id: session.apiKey.id,
        name: session.apiKey.name,
        prefix: session.apiKey.key_prefix,
        lastUsedAt: session.apiKey.last_used_at
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account lookup failed";
    return Response.json({ error: message }, { status: 401 });
  }
}
