import { NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  createRoom,
  addPlayer,
} from '@/lib/game-store';

export const dynamic = 'force-dynamic';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST() {
  try {
    const code = generateRoomCode();
    const hostId = `host_${crypto.randomUUID()}`;

    if (isSupabaseConfigured()) {
      // ── Supabase Mode ──
      const { supabaseAdmin } = await import('@/lib/supabase-server');

      const { data: room, error: roomError } = await supabaseAdmin
        .from('rooms')
        .insert({
          code,
          status: 'lobby',
          current_round: 0,
          total_rounds: 10,
          current_question_index: -1,
          round_start_time: null,
        })
        .select()
        .single();

      if (roomError) {
        console.error('Room creation error:', roomError);
        return NextResponse.json({ error: 'Failed to create room' }, { status: 500 });
      }

      await supabaseAdmin.from('players').insert({
        room_id: room.id,
        player_id: hostId,
        nickname: 'Host',
        score: 0,
        is_host: true,
      });

      return NextResponse.json({ roomCode: room.code, roomId: room.id, hostId });
    } else {
      // ── Demo Mode (in-memory) ──
      const room = createRoom(code);
      addPlayer(room.id, hostId, 'Host', true);

      return NextResponse.json({ roomCode: room.code, roomId: room.id, hostId });
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
