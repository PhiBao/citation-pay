import { getStore } from "@/lib/db";
import {
  createPaymentRequiredResponse,
  isMockPaymentMode,
  paymentResponseHeader,
  settlePaymentSignature
} from "@/lib/payment";
import type { PaidSourceCard } from "@/lib/types";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const source = await getStore().getSource(id);
  if (!source) return Response.json({ error: "Source not found" }, { status: 404 });

  if (isMockPaymentMode()) {
    return Response.json({ source: sourceToPaidCard(source), payment: { status: "mocked" } });
  }

  if (!request.headers.get("payment-signature")) {
    return createPaymentRequiredResponse(request.url, source);
  }

  try {
    const receipt = await settlePaymentSignature(request, source);
    return Response.json(
      { source: sourceToPaidCard(source), payment: receipt },
      {
        headers: {
          "PAYMENT-RESPONSE": paymentResponseHeader(receipt)
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment failed";
    return Response.json({ error: message }, { status: 402 });
  }
}

function sourceToPaidCard(source: Awaited<ReturnType<ReturnType<typeof getStore>["getSource"]>>): PaidSourceCard {
  if (!source) throw new Error("Source not found");
  return {
    sourceId: source.id,
    title: source.title,
    canonicalUrl: source.canonical_url,
    excerpt: source.excerpt,
    publisherName: source.publisher.name,
    priceMicroUsdc: source.price_micro_usdc
  };
}
