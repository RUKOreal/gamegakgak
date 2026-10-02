import { NextRequest, NextResponse } from 'next/server';
import { getGameQuestions } from '@/lib/questions';
import {
  isSupabaseConfigured,
  getRoomByCode,
  getPlayerByPlayerId,
  getPlayers,
  updateRoom,
  resetAllPlayerScores,
} from '@/lib/game-store';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, hostId, songCount } = await request.json();

    // Validate and clamp song count (default 10, range 1–30)
    const count = Math.max(1, Math.min(30, Number(songCount) || 10));

    // Generate random questions for this game
    const questions = getGameQuestions(count);
    const totalRounds = questions.length;
    const questionIds = questions.map((q) => q.id);
    const startTime = Date.now();

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

      const { data: hostPlayer } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('room_id', room.id)
        .eq('player_id', hostId)
        .eq('is_host', true)
        .single();

      if (!hostPlayer) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      await supabaseAdmin
        .from('rooms')
        .update({
          status: 'playing',
          current_round: 1,
          total_rounds: totalRounds,
          current_question_index: 0,
          round_start_time: startTime,
          question_ids: questionIds,
        })
        .eq('id', room.id);

      await supabaseAdmin
        .from('players')
        .update({ score: 0 })
        .eq('room_id', room.id);

      const firstQuestion = questions[0];
      return NextResponse.json({
        success: true,
        totalRounds,
        currentRound: 1,
        question: {
          id: firstQuestion.id,
          options: firstQuestion.options,
          audioUrl: firstQuestion.audioUrl,
          youtubeId: firstQuestion.youtubeId,
        },
        startTime,
      });
    } else {
      // ── Demo Mode (in-memory) ──
      const room = getRoomByCode(roomCode.toUpperCase());
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      let hostPlayer = hostId ? getPlayerByPlayerId(room.id, hostId) : undefined;
      if (!hostPlayer || !hostPlayer.is_host) {
        hostPlayer = getPlayers(room.id).find((p) => p.is_host);
      }
      if (!hostPlayer || !hostPlayer.is_host) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      updateRoom(room.id, {
        status: 'playing',
        current_round: 1,
        total_rounds: totalRounds,
        current_question_index: 0,
        round_start_time: startTime,
        question_ids: questionIds,
      });

      resetAllPlayerScores(room.id);

      const firstQuestion = questions[0];
      return NextResponse.json({
        success: true,
        totalRounds,
        currentRound: 1,
        question: {
          id: firstQuestion.id,
          options: firstQuestion.options,
          audioUrl: firstQuestion.audioUrl,
          youtubeId: firstQuestion.youtubeId,
        },
        startTime,
      });
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
