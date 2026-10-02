import { NextRequest, NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  getRoomByCode,
  getPlayerByNickname,
  addPlayer,
} from '@/lib/game-store';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, nickname } = await request.json();

    if (!roomCode || !nickname) {
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
        .eq('code', roomCode.toUpperCase())
        .single();

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
        .eq('nickname', nickname)
        .single();

      if (existingPlayer) {
        return NextResponse.json({ error: 'Nickname already taken' }, { status: 400 });
      }

      await supabaseAdmin.from('players').insert({
        room_id: room.id,
        player_id: playerId,
        nickname: nickname.trim(),
        score: 0,
        is_host: false,
      });

      return NextResponse.json({
        roomCode: room.code,
        roomId: room.id,
        playerId,
        nickname: nickname.trim(),
      });
    } else {
      // ── Demo Mode (in-memory) ──
      const room = getRoomByCode(roomCode.toUpperCase());
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      if (room.status !== 'lobby') {
        return NextResponse.json({ error: 'Game already in progress' }, { status: 400 });
      }

      const existing = getPlayerByNickname(room.id, nickname);
      if (existing) {
        return NextResponse.json({ error: 'Nickname already taken' }, { status: 400 });
      }

      addPlayer(room.id, playerId, nickname.trim(), false);

      return NextResponse.json({
        roomCode: room.code,
        roomId: room.id,
        playerId,
        nickname: nickname.trim(),
      });
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
