import { getStore } from "@/lib/db";
import { formatMicroUsdc } from "@/lib/price";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const source = await getStore().getSource(id);
  if (!source) return Response.json({ error: "Source not found" }, { status: 404 });

  return Response.json({
    source: {
      id: source.id,
      title: source.title,
      publisher: source.publisher.name,
      price: formatMicroUsdc(source.price_micro_usdc),
      canonicalUrl: source.canonical_url
    }
  });
}
