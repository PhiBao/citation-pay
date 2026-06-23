import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hasSupabaseEnv } from "@/lib/env";

export function createSupabaseServer() {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase env is not configured");
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: async () => {
          const store = await cookies();
          return store.getAll();
        },
        setAll: async (items) => {
          const store = await cookies();
          for (const { name, value, options } of items) {
            try {
              store.set(name, value, options);
            } catch {
              // ignore in server components
            }
          }
        }
      }
    }
  );
}

export function createSupabaseAdmin() {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase env is not configured");
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: async () => [],
        setAll: async () => {}
      },
      auth: { persistSession: false }
    }
  );
}
