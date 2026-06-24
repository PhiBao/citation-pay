import { NextResponse } from "next/server";
import { getInstanceInfo } from "@/lib/mastodon";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const instance = url.searchParams.get("instance");
  if (!instance) return NextResponse.json({ error: "instance param required" }, { status: 400 });
  try {
    const info = await getInstanceInfo(instance);
    return NextResponse.json(info);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reach instance" },
      { status: 502 }
    );
  }
}
