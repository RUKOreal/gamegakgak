import { NextRequest, NextResponse } from 'next/server';
import { QUESTIONS } from '@/lib/questions';
import {
  isSupabaseConfigured,
  getRoomByCode,
  getPlayerByPlayerId,
  getPlayers,
  getRoundAnswers,
  updateRoom,
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

      // If already finished or round_end, return current status
      const { data: roundAnswers } = await supabaseAdmin
        .from('answers')
        .select('*')
        .eq('room_id', room.id)
        .eq('round', room.current_round)
        .order('time_taken_ms', { ascending: true });

      const questionIds: number[] = room.question_ids || [];
      const currentQuestionId = questionIds[room.current_question_index];
      const currentQuestion = QUESTIONS.find((q) => q.id === currentQuestionId);

      const { data: players } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('room_id', room.id)
        .eq('is_host', false)
        .order('score', { ascending: false });

      const leaderboard = (players || []).map((p, idx) => {
        const roundAnswer = (roundAnswers || []).find((a) => a.player_id === p.player_id);
        return {
          player_id: p.player_id,
          nickname: p.nickname,
          score: p.score,
          rank: idx + 1,
          last_time_taken_ms: roundAnswer?.time_taken_ms,
          last_score_earned: roundAnswer?.score_earned,
        };
      });

      const roundResults = (roundAnswers || []).map((a) => {
        const player = (players || []).find((p) => p.player_id === a.player_id);
        return {
          player_id: a.player_id,
          nickname: player?.nickname || 'Unknown',
          answer_index: a.answer_index,
          is_correct: a.is_correct,
          time_taken_ms: a.time_taken_ms,
          score_earned: a.score_earned,
        };
      });

      const isGameOver = room.current_round >= room.total_rounds;

      await supabaseAdmin
        .from('rooms')
        .update({ status: 'round_end' })
        .eq('id', room.id);

      return NextResponse.json({
        success: true,
        isGameOver,
        roundResults,
        leaderboard,
        currentQuestion: currentQuestion
          ? {
              songTitle: currentQuestion.songTitle,
              series: currentQuestion.series,
              artist: currentQuestion.artist,
              albumTitle: currentQuestion.albumTitle,
              era: currentQuestion.era,
              themeColor: currentQuestion.themeColor,
              coverUrl: currentQuestion.coverUrl,
              correctIndex: currentQuestion.correctIndex,
              youtubeId: currentQuestion.youtubeId,
              audioUrl: currentQuestion.audioUrl,
            }
          : null,
      });
    } else {
      // ── Demo Mode (in-memory) ──
      const room = getRoomByCode(cleanRoomCode);
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      // In demo mode, verify host with fallback
      let hostPlayer = hostId ? getPlayerByPlayerId(room.id, hostId) : undefined;
      if (!hostPlayer || !hostPlayer.is_host) {
        hostPlayer = getPlayers(room.id).find((p) => p.is_host);
      }

      const roundAnswers = getRoundAnswers(room.id, room.current_round);
      const currentQuestionId = room.question_ids[room.current_question_index];
      const currentQuestion = QUESTIONS.find((q) => q.id === currentQuestionId);

      const allPlayers = getPlayers(room.id)
        .filter((p) => !p.is_host)
        .sort((a, b) => b.score - a.score);

      const leaderboard = allPlayers.map((p, idx) => {
        const roundAnswer = roundAnswers.find((a) => a.player_id === p.player_id);
        return {
          player_id: p.player_id,
          nickname: p.nickname,
          score: p.score,
          rank: idx + 1,
          last_time_taken_ms: roundAnswer?.time_taken_ms,
          last_score_earned: roundAnswer?.score_earned,
        };
      });

      const roundResults = roundAnswers.map((a) => {
        const player = allPlayers.find((p) => p.player_id === a.player_id);
        return {
          player_id: a.player_id,
          nickname: player?.nickname || 'Unknown',
          answer_index: a.answer_index,
          is_correct: a.is_correct,
          time_taken_ms: a.time_taken_ms,
          score_earned: a.score_earned,
        };
      });

      const isGameOver = room.current_round >= room.total_rounds;

      const questionData = currentQuestion
        ? {
            songTitle: currentQuestion.songTitle,
            series: currentQuestion.series,
            artist: currentQuestion.artist,
            albumTitle: currentQuestion.albumTitle,
            era: currentQuestion.era,
            themeColor: currentQuestion.themeColor,
            coverUrl: currentQuestion.coverUrl,
            correctIndex: currentQuestion.correctIndex,
            youtubeId: currentQuestion.youtubeId,
            audioUrl: currentQuestion.audioUrl,
          }
        : null;

      const roundEndData = {
        correctIndex: questionData?.correctIndex ?? 0,
        songTitle: questionData?.songTitle ?? '',
        series: questionData?.series ?? '',
        artist: questionData?.artist ?? '',
        albumTitle: questionData?.albumTitle,
        era: questionData?.era,
        themeColor: questionData?.themeColor,
        coverUrl: questionData?.coverUrl,
        youtubeId: questionData?.youtubeId,
        audioUrl: questionData?.audioUrl,
        leaderboard,
        roundResults,
        isGameOver,
        roundEndTime: Date.now(),
      };

      updateRoom(room.id, {
        status: 'round_end',
        round_end_data: roundEndData,
      });

      return NextResponse.json({
        success: true,
        isGameOver,
        roundResults,
        leaderboard,
        currentQuestion: questionData,
      });
    }
  } catch (err) {
    console.error('End-round error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
