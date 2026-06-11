import { z } from "zod";
import { runCitationAgent } from "@/lib/agent";
import { parseUsdToMicroUsdc } from "@/lib/price";

const schema = z.object({
  query: z.string().min(8).max(600),
  budgetUsd: z.coerce.number().positive().max(100)
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message || "Invalid agent request" }, { status: 400 });
    }
    const result = await runCitationAgent(parsed.data.query, parseUsdToMicroUsdc(parsed.data.budgetUsd));
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent payment run failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
