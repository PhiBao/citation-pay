import { z } from "zod";
import { runCitationAgent } from "@/lib/agent";
import { parseUsdToMicroUsdc } from "@/lib/price";
import { requireSession } from "@/lib/accounts";

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
    const session = await requireSession(request);
    const budgetMicroUsdc = parseUsdToMicroUsdc(parsed.data.budgetUsd);
    const result = await runCitationAgent(parsed.data.query, budgetMicroUsdc, { session, clientType: "web" });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent payment run failed";
    const status = /api key|required|invalid|disabled|authentication/i.test(message)
      ? 401
      : /balance|limit/i.test(message)
        ? 402
        : 500;
    return Response.json({ error: message }, { status });
  }
}
