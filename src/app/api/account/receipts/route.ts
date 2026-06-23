import { NextResponse } from "next/server";
import { requireSession } from "@/lib/accounts";
import { getStore } from "@/lib/db";
import { formatMicroUsdc } from "@/lib/price";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const store = getStore();
    const payments = await store.listPaymentsForAccount(session.account.id, 50);
    return NextResponse.json({
      receipts: payments.map((p) => ({
        id: p.id,
        amount: formatMicroUsdc(p.amount_micro_usdc),
        network: p.network,
        status: p.status,
        transferId: p.transfer_id,
        title: p.source?.title,
        publisher: p.source?.publisher.name,
        canonicalUrl: p.source?.canonical_url,
        createdAt: p.created_at
      }))
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 401 });
  }
}
