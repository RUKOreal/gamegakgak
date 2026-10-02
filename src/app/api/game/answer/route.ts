import { NextRequest, NextResponse } from 'next/server';
import { QUESTIONS, calculateScore } from '@/lib/questions';
import {
  isSupabaseConfigured,
  getRoomByCode,
  getAnswer as getMemAnswer,
  addAnswer as addMemAnswer,
  getPlayerByPlayerId,
  updatePlayerScore,
} from '@/lib/game-store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { roomCode, playerId, answerIndex, timeTakenMs } = await request.json();
    const cleanRoomCode = typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';

    if (!cleanRoomCode || !playerId) {
      return NextResponse.json({ error: 'roomCode and playerId are required' }, { status: 400 });
    }

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

      if (room.status !== 'playing') {
        return NextResponse.json({ error: 'Game not in progress' }, { status: 400 });
      }

      const { data: existingAnswer } = await supabaseAdmin
        .from('answers')
        .select('id')
        .eq('room_id', room.id)
        .eq('player_id', playerId)
        .eq('round', room.current_round)
        .maybeSingle();

      if (existingAnswer) {
        return NextResponse.json({ error: 'Already answered' }, { status: 400 });
      }

      const questionIds: number[] = room.question_ids || [];
      const currentQuestionId = questionIds[room.current_question_index];
      const question = QUESTIONS.find((q) => q.id === currentQuestionId);

      if (!question) {
        return NextResponse.json({ error: 'Question not found' }, { status: 500 });
      }

      const isCorrect = answerIndex === question.correctIndex;
      const scoreEarned = calculateScore(timeTakenMs, isCorrect);

      await supabaseAdmin.from('answers').insert({
        room_id: room.id,
        player_id: playerId,
        round: room.current_round,
        answer_index: answerIndex,
        is_correct: isCorrect,
        time_taken_ms: timeTakenMs,
        score_earned: scoreEarned,
      });

      if (scoreEarned > 0) {
        const { data: player } = await supabaseAdmin
          .from('players')
          .select('score')
          .eq('room_id', room.id)
          .eq('player_id', playerId)
          .single();

        if (player) {
          await supabaseAdmin
            .from('players')
            .update({ score: player.score + scoreEarned })
            .eq('room_id', room.id)
            .eq('player_id', playerId);
        }
      }

      const { data: playerData } = await supabaseAdmin
        .from('players')
        .select('nickname')
        .eq('room_id', room.id)
        .eq('player_id', playerId)
        .single();

      return NextResponse.json({
        success: true,
        isCorrect,
        scoreEarned,
        timeTakenMs,
        correctIndex: question.correctIndex,
        nickname: playerData?.nickname,
      });
    } else {
      // ── Demo Mode (in-memory) ──
      const room = getRoomByCode(cleanRoomCode);
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      if (room.status !== 'playing') {
        return NextResponse.json({ error: 'Game not in progress' }, { status: 400 });
      }

      const existing = getMemAnswer(room.id, playerId, room.current_round);
      if (existing) {
        return NextResponse.json({ error: 'Already answered' }, { status: 400 });
      }

      const currentQuestionId = room.question_ids[room.current_question_index];
      const question = QUESTIONS.find((q) => q.id === currentQuestionId);

      if (!question) {
        return NextResponse.json({ error: 'Question not found' }, { status: 500 });
      }

      const isCorrect = answerIndex === question.correctIndex;
      const scoreEarned = calculateScore(timeTakenMs, isCorrect);

      addMemAnswer(room.id, playerId, room.current_round, answerIndex, isCorrect, timeTakenMs, scoreEarned);

      if (scoreEarned > 0) {
        updatePlayerScore(room.id, playerId, scoreEarned);
      }

      const player = getPlayerByPlayerId(room.id, playerId);

      return NextResponse.json({
        success: true,
        isCorrect,
        scoreEarned,
        timeTakenMs,
        correctIndex: question.correctIndex,
        nickname: player?.nickname,
      });
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
