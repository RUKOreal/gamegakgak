import { NextRequest, NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  getRoomByCode,
  getPlayers,
  getRoundAnswers,
} from '@/lib/game-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  try {
    const { roomCode } = await params;

    if (isSupabaseConfigured()) {
      // ── Supabase Mode ──
      const { supabaseAdmin } = await import('@/lib/supabase-server');

      const { data: room, error: roomError } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('code', roomCode.toUpperCase())
        .single();

      if (roomError || !room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      const { data: players, error: playersError } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: true });

      if (playersError) {
        return NextResponse.json({ error: 'Failed to get players' }, { status: 500 });
      }

      // Count answers for current round
      const { count: answeredCount } = await supabaseAdmin
        .from('answers')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .eq('round', room.current_round);

      const nonHostPlayers = (players || []).filter((p) => !p.is_host);

      return NextResponse.json({
        room,
        players,
        answeredCount: answeredCount || 0,
        totalPlayers: nonHostPlayers.length,
      });
    } else {
      // ── Demo Mode (in-memory) ──
      const room = getRoomByCode(roomCode.toUpperCase());
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      const players = getPlayers(room.id);
      const nonHostPlayers = players.filter((p) => !p.is_host);
      const currentRoundAnswers = getRoundAnswers(room.id, room.current_round);

      return NextResponse.json({
        room,
        players,
        answeredCount: currentRoundAnswers.length,
        totalPlayers: nonHostPlayers.length,
        roundEndData: room.round_end_data || null,
      });
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
