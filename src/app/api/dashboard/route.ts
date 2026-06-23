import { getStore } from "@/lib/db";
import { paymentMode } from "@/lib/env";

export async function GET() {
  try {
    const dashboard = await getStore().dashboard();
    return Response.json({
      ...dashboard,
      health: {
        database: "ok",
        error: null
      },
      paymentMode: paymentMode()
    });
  } catch (error) {
    return Response.json({
      accounts: [],
      publishers: [],
      feeds: [],
      sources: [],
      runs: [],
      payments: [],
      decisions: [],
      cache: [],
      health: {
        database: "down",
        error: error instanceof Error ? error.message : "Dashboard unavailable"
      },
      paymentMode: paymentMode()
    });
  }
}
