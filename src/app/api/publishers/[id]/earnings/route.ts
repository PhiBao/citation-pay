import { NextResponse } from "next/server";
import { requireSession } from "@/lib/accounts";
import { getStore } from "@/lib/db";
import { formatMicroUsdc } from "@/lib/price";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request);
    const { id } = await params;
    const store = getStore();
    const publisher = await store.getPublisher(id);
    if (!publisher) return NextResponse.json({ error: "Publisher not found" }, { status: 404 });
    if (publisher.supabase_user_id && publisher.supabase_user_id !== session.account.supabase_user_id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const payments = await store.listPaymentsForPublisher(publisher.id, 50);
    const walletEvents = await store.listWalletEventsForPublisher(publisher.id, 25);
    const totalMicro = payments
      .filter((p) => p.status === "settled")
      .reduce((sum, p) => sum + p.amount_micro_usdc, 0);
    return NextResponse.json({
      publisher,
      totals: {
        citations: payments.length,
        totalMicroUsdc: totalMicro,
        total: formatMicroUsdc(totalMicro)
      },
      payments: payments.map((p) => ({
        id: p.id,
        amount: formatMicroUsdc(p.amount_micro_usdc),
        amountMicroUsdc: p.amount_micro_usdc,
        network: p.network,
        status: p.status,
        transferId: p.transfer_id,
        title: p.source?.title,
        canonicalUrl: p.source?.canonical_url,
        createdAt: p.created_at
      })),
      walletEvents
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 401 });
  }
}
