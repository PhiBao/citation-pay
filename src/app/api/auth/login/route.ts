import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const supabase = createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase(),
    password
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // Build response with Set-Cookie headers from the session
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const allCookies = store.getAll();
  const response = NextResponse.json({ redirect: "/app" });
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
