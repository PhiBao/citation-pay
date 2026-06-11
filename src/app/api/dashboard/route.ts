import { getStore } from "@/lib/db";
import { paymentMode } from "@/lib/env";

export async function GET() {
  const dashboard = await getStore().dashboard();
  return Response.json({
    ...dashboard,
    paymentMode: paymentMode()
  });
}
