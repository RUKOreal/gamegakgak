import { NextRequest, NextResponse } from 'next/server';
import { QUESTIONS } from '@/lib/questions';
import {
  isSupabaseConfigured,
  getRoomByCode,
  getPlayerByPlayerId,
  getPlayers,
  updateRoom,
} from '@/lib/game-store';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, hostId } = await request.json();

    if (!roomCode) {
      return NextResponse.json({ error: 'roomCode is required' }, { status: 400 });
    }

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

      const questionIds: number[] = room.question_ids || [];
      const nextRound = room.current_round + 1;
      const isGameOver = nextRound > room.total_rounds;

      if (isGameOver) {
        await supabaseAdmin
          .from('rooms')
          .update({ status: 'finished' })
          .eq('id', room.id);

        return NextResponse.json({
          success: true,
          isGameOver: true,
        });
      }

      const nextQuestionId = questionIds[room.current_question_index + 1];
      const nextQuestion = QUESTIONS.find((q) => q.id === nextQuestionId);
      const startTime = Date.now();

      await supabaseAdmin
        .from('rooms')
        .update({
          current_round: nextRound,
          current_question_index: room.current_question_index + 1,
          round_start_time: startTime,
          status: 'playing',
        })
        .eq('id', room.id);

      return NextResponse.json({
        success: true,
        isGameOver: false,
        nextRound,
        nextQuestion: nextQuestion
          ? {
              id: nextQuestion.id,
              options: nextQuestion.options,
              audioUrl: nextQuestion.audioUrl,
              youtubeId: nextQuestion.youtubeId,
            }
          : null,
        startTime,
      });
    } else {
      // ── Demo Mode (in-memory) ──
      const room = getRoomByCode(roomCode.toUpperCase());
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      // Verify host with fallback
      let hostPlayer = hostId ? getPlayerByPlayerId(room.id, hostId) : undefined;
      if (!hostPlayer || !hostPlayer.is_host) {
        hostPlayer = getPlayers(room.id).find((p) => p.is_host);
      }

      const nextRound = room.current_round + 1;
      const isGameOver = nextRound > room.total_rounds;

      if (isGameOver) {
        updateRoom(room.id, { status: 'finished' });
        return NextResponse.json({
          success: true,
          isGameOver: true,
        });
      }

      const nextQIndex = room.current_question_index + 1;
      const nextQuestionId = room.question_ids[nextQIndex];
      const nextQuestion = QUESTIONS.find((q) => q.id === nextQuestionId);
      const startTime = Date.now();

      updateRoom(room.id, {
        current_round: nextRound,
        current_question_index: nextQIndex,
        round_start_time: startTime,
        status: 'playing',
        round_end_data: null,
      });

      return NextResponse.json({
        success: true,
        isGameOver: false,
        nextRound,
        nextQuestion: nextQuestion
          ? {
              id: nextQuestion.id,
              options: nextQuestion.options,
              audioUrl: nextQuestion.audioUrl,
              youtubeId: nextQuestion.youtubeId,
            }
          : null,
        startTime,
      });
    }
  } catch (err) {
    console.error('Next-round error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
