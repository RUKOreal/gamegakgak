import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/game-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  return NextResponse.json({
    demoMode: !isSupabaseConfigured(),
    supabaseConfigured: isSupabaseConfigured(),
    debug: {
      hasUrl: !!url,
      urlLength: url.length,
      urlStart: url ? url.substring(0, 15) : null,
      hasAnonKey: !!anonKey,
      anonKeyLength: anonKey.length,
      anonKeyStart: anonKey ? anonKey.substring(0, 10) : null,
      hasServiceKey: !!serviceKey,
    },
  });
}
