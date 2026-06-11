import { z } from "zod";
import { getStore } from "@/lib/db";
import { parseUsdToMicroUsdc } from "@/lib/price";

const schema = z.object({
  name: z.string().min(2).max(80),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Wallet must be an EVM address"),
  defaultPriceUsd: z.coerce.number().positive().max(10)
});

export async function GET() {
  const publishers = await getStore().listPublishers();
  return Response.json({ publishers });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Invalid publisher" }, { status: 400 });
  }
  const publisher = await getStore().createPublisher({
    name: parsed.data.name,
    wallet_address: parsed.data.walletAddress,
    default_price_micro_usdc: parseUsdToMicroUsdc(parsed.data.defaultPriceUsd)
  });
  return Response.json({ publisher });
}
