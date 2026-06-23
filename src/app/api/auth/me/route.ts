import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getStore } from "@/lib/db";
import { serializeAccount } from "@/lib/accounts";

export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ user: null });
    }
    const supabaseUserId = auth.user.id;
    const store = getStore();
    const account = await store.findAccountBySupabaseUser(supabaseUserId);
    if (!account) {
      return NextResponse.json({ user: null });
    }
    return NextResponse.json({
      user: {
        id: auth.user.id,
        email: auth.user.email,
        name: (auth.user.user_metadata as { name?: string } | null)?.name || account.name,
        supabaseUserId,
        account: serializeAccount(account)
      }
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
