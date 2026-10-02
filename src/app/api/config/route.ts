import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/game-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    demoMode: !isSupabaseConfigured(),
    supabaseConfigured: isSupabaseConfigured(),
  });
}
