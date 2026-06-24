import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hasSupabaseEnv } from "@/lib/env";

export function createSupabaseServer() {
  return createSupabaseServerClient({ useServiceRole: false });
}

export function createSupabaseAdmin() {
  return createSupabaseServerClient({ useServiceRole: true });
}

function createSupabaseServerClient({ useServiceRole }: { useServiceRole: boolean }) {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase env is not configured");
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    useServiceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY! : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: async () => {
          const store = await cookies();
          return store.getAll();
        },
        setAll: async (entries) => {
          const store = await cookies();
          for (const { name, value, options } of entries) {
            store.set(name, value, { ...options, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" });
          }
        }
      }
    }
  );
}

export async function getSessionCookieHeader() {
  const store = await cookies();
  return store.getAll();
}
