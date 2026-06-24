import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getStore } from "@/lib/db";
import { serializeAccount, provisionAccount } from "@/lib/accounts";
import { ensureAccountWallet } from "@/lib/wallets/wallets";

export async function GET() {
  try {
    const supabase = createSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ user: null });
    }
    const supabaseUserId = auth.user.id;
    const store = getStore();
    let account = await store.findAccountBySupabaseUser(supabaseUserId);

    if (!account && auth.user.email) {
      const existingByEmail = await store.findAccountByEmail(auth.user.email);
      if (existingByEmail) {
        await store.linkSupabaseUser(existingByEmail.id, supabaseUserId);
        account = existingByEmail;
      } else {
        await provisionAccount({
          name: (auth.user.user_metadata as { name?: string } | null)?.name || auth.user.email.split("@")[0],
          email: auth.user.email,
          supabaseUserId
        });
        account = (await store.findAccountBySupabaseUser(supabaseUserId))!;
      }
    }

    if (!account) {
      return NextResponse.json({ user: null });
    }

    // Fire-and-forget wallet creation — slow Circle API call, don't block
    if (!account.circle_wallet_address) {
      ensureAccountWallet(account.id).catch(() => {});
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
