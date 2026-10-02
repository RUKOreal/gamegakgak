import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase admin client for server-side usage (API routes).
 * Uses the service role key — bypasses RLS for full CRUD access.
 * NEVER expose this on the client side.
 *
 * Lazily initialized to avoid errors during build time when env vars
 * might not be available yet (Vercel sets them at runtime).
 */
let _supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).'
      );
    }

    _supabaseAdmin = createClient(supabaseUrl, supabaseKey);
  }
  return _supabaseAdmin;
}

/**
 * Convenience alias — use in API routes:
 * `import { supabaseAdmin } from '@/lib/supabase-server';`
 *
 * Note: This is a getter that lazily initializes the client.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getSupabaseAdmin(), prop);
  },
});
