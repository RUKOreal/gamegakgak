import { NextRequest, NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  getRoomByCode,
  getPlayerByPlayerId,
  getPlayers,
  updateRoom,
  resetAllPlayerScores,
  clearRoomAnswers,
} from '@/lib/game-store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, hostId } = await request.json();
    const cleanRoomCode = typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';

    if (!cleanRoomCode) {
      return NextResponse.json({ error: 'roomCode is required' }, { status: 400 });
    }

    if (isSupabaseConfigured()) {
      const { supabaseAdmin } = await import('@/lib/supabase-server');

      const { data: room, error: roomError } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('code', cleanRoomCode)
        .maybeSingle();

      if (roomError || !room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      // Reset room state to lobby
      await supabaseAdmin
        .from('rooms')
        .update({
          status: 'lobby',
          current_round: 0,
          current_question_index: -1,
          round_start_time: null,
          question_ids: [],
        })
        .eq('id', room.id);

      // Reset player scores
      await supabaseAdmin
        .from('players')
        .update({ score: 0 })
        .eq('room_id', room.id);

      // Clear answers
      await supabaseAdmin
        .from('answers')
        .delete()
        .eq('room_id', room.id);

      return NextResponse.json({ success: true, status: 'lobby' });
    } else {
      const room = getRoomByCode(cleanRoomCode);
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      let hostPlayer = hostId ? getPlayerByPlayerId(room.id, hostId) : undefined;
      if (!hostPlayer || !hostPlayer.is_host) {
        hostPlayer = getPlayers(room.id).find((p) => p.is_host);
      }

      updateRoom(room.id, {
        status: 'lobby',
        current_round: 0,
        total_rounds: 10,
        current_question_index: -1,
        round_start_time: null,
        question_ids: [],
        round_end_data: null,
      });

      resetAllPlayerScores(room.id);
      clearRoomAnswers(room.id);

      return NextResponse.json({ success: true, status: 'lobby' });
    }
  } catch (err) {
    console.error('Room reset error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
