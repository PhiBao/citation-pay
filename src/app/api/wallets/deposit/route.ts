import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/accounts";
import { faucetCredit, depositFromArc, isArcAvailable } from "@/lib/appkit/appkit";

const faucetSchema = z.object({
  amountUsd: z.string().min(1)
});

const depositSchema = z.object({
  amountUsd: z.string().min(1),
  txHash: z.string().optional()
});

export async function GET() {
  return NextResponse.json({
    arcAvailable: isArcAvailable(),
    network: "ARC-TESTNET",
    faucet: "Get testnet USDC from TestMint (testmint.myproceeds.xyz) and send it to your Arc wallet address."
  });
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await request.json();
    const mode = (body.mode as string) || "faucet";

    if (mode === "deposit") {
      const parsed = depositSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      const result = await depositFromArc({
        accountId: session.account.id,
        amountUsd: parsed.data.amountUsd,
        txHash: parsed.data.txHash
      });
      return NextResponse.json(result);
    }

    const parsed = faucetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
    }
    const result = await faucetCredit({
      accountId: session.account.id,
      amountUsd: parsed.data.amountUsd
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deposit failed" },
      { status: 500 }
    );
  }
}
