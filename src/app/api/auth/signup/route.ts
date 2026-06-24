import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin, createSupabaseServer } from "@/lib/supabase/server";
import { getStore } from "@/lib/db";
import { provisionAccount } from "@/lib/accounts";
import { ensureAccountWallet } from "@/lib/wallets/wallets";

const signupSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(8).max(200),
  name: z.string().min(2).max(80)
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }
  const { email, password, name } = parsed.data;

  // Create auth user
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { name }
  });
  if (error || !data.user) {
    return NextResponse.json({ error: error?.message || "Failed to create user" }, { status: 400 });
  }

  // Provision CitationPay account
  try {
    const store = getStore();
    const existing = await store.findAccountBySupabaseUser(data.user.id);
    if (!existing) {
      await provisionAccount({ name, email: email.toLowerCase(), supabaseUserId: data.user.id });
    }
    const account = await store.findAccountBySupabaseUser(data.user.id);
    if (account) {
      await ensureAccountWallet(account.id);
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Provisioning failed" }, { status: 500 });
  }

  // Sign in to set session cookie
  const supabase = createSupabaseServer();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase(),
    password
  });
  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 401 });
  }

  // Explicitly pass cookies in the response
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const allCookies = store.getAll();
  const response = NextResponse.json({ redirect: "/app?welcome=1" });
  for (const cookie of allCookies) {
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 400
    });
  }
  return response;
}
