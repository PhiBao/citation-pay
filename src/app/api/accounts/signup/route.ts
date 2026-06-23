import { z } from "zod";
import { createAccount, serializeAccount } from "@/lib/accounts";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(160)
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message || "Invalid account" }, { status: 400 });
    }
    const { account, apiKey, key } = await createAccount(parsed.data.name, parsed.data.email);
    return Response.json({
      account: serializeAccount(account),
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.key_prefix,
        key
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account signup failed";
    const status = /duplicate|unique/i.test(message) ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
