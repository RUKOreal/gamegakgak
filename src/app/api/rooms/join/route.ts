import { NextRequest, NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  getRoomByCode,
  getPlayerByNickname,
  addPlayer,
} from '@/lib/game-store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, nickname } = await request.json();

    const cleanRoomCode = typeof roomCode === 'string' ? roomCode.replace(/\s+/g, '').toUpperCase() : '';
    const cleanNickname = typeof nickname === 'string' ? nickname.trim() : '';

    if (!cleanRoomCode || !cleanNickname) {
      return NextResponse.json(
        { error: 'Room code and nickname are required' },
        { status: 400 }
      );
    }

    const playerId = `player_${crypto.randomUUID()}`;

    if (isSupabaseConfigured()) {
      // ── Supabase Mode ──
      const { supabaseAdmin } = await import('@/lib/supabase-server');

      const { data: room, error: roomError } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('code', cleanRoomCode)
        .maybeSingle();

      if (roomError || !room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      if (room.status !== 'lobby') {
        return NextResponse.json({ error: 'Game already in progress' }, { status: 400 });
      }

      const { data: existingPlayer } = await supabaseAdmin
        .from('players')
        .select('id')
        .eq('room_id', room.id)
        .eq('nickname', cleanNickname)
        .maybeSingle();

      if (existingPlayer) {
        return NextResponse.json({ error: 'Nickname already taken' }, { status: 400 });
      }

      await supabaseAdmin.from('players').insert({
        room_id: room.id,
        player_id: playerId,
        nickname: cleanNickname,
        score: 0,
        is_host: false,
      });

      return NextResponse.json({
        roomCode: room.code,
        roomId: room.id,
        playerId,
        nickname: cleanNickname,
      });
    } else {
      // ── Demo Mode (in-memory) ──
      const room = getRoomByCode(cleanRoomCode);
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      if (room.status !== 'lobby') {
        return NextResponse.json({ error: 'Game already in progress' }, { status: 400 });
      }

      const existing = getPlayerByNickname(room.id, cleanNickname);
      if (existing) {
        return NextResponse.json({ error: 'Nickname already taken' }, { status: 400 });
      }

      addPlayer(room.id, playerId, cleanNickname, false);

      return NextResponse.json({
        roomCode: room.code,
        roomId: room.id,
        playerId,
        nickname: cleanNickname,
      });
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
