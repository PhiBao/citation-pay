import { NextResponse } from "next/server";
import { requireSession } from "@/lib/accounts";
import { getStore } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const store = getStore();
    const runs = await store.listRuns(session.account.id, 25);
    return NextResponse.json({
      account: session.account,
      runs: runs.map((run) => ({
        id: run.id,
        query: run.query,
        budgetMicroUsdc: run.budget_micro_usdc,
        spentMicroUsdc: run.spent_micro_usdc,
        status: run.status,
        clientType: run.client_type,
        createdAt: run.created_at,
        answerPreview: run.answer.slice(0, 240)
      }))
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 401 });
  }
}
