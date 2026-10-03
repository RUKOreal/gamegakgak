import { NextRequest, NextResponse } from 'next/server';
import { QUESTIONS } from '@/lib/questions';
import { isSupabaseConfigured, getRoomByCode } from '@/lib/game-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/game/question?roomCode=XXXX&round=1
 * Returns the current question options for a given room and round.
 * Used in demo mode for player polling.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomCode = searchParams.get('roomCode');
    const cleanRoomCode = (roomCode || '').trim().toUpperCase();
    const round = parseInt(searchParams.get('round') || '0');

    if (!cleanRoomCode) {
      return NextResponse.json({ error: 'roomCode required' }, { status: 400 });
    }

    if (isSupabaseConfigured()) {
      const { supabaseAdmin } = await import('@/lib/supabase-server');

      const { data: room } = await supabaseAdmin
        .from('rooms')
        .select('*')
        .eq('code', cleanRoomCode)
        .maybeSingle();

      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      const questionIds: number[] = room.question_ids || [];
      const qIndex = round - 1;
      if (qIndex < 0 || qIndex >= questionIds.length) {
        return NextResponse.json({ error: 'Invalid round' }, { status: 400 });
      }

      const questionId = questionIds[qIndex];
      const question = QUESTIONS.find((q) => q.id === questionId);

      if (!question) {
        return NextResponse.json({ error: 'Question not found' }, { status: 404 });
      }

      return NextResponse.json({
        question: {
          id: question.id,
          options: question.options,
          audioUrl: question.audioUrl,
          youtubeId: question.youtubeId,
        },
        serverTime: Date.now(),
      });
    } else {
      // Demo mode
      const room = getRoomByCode(cleanRoomCode);
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      const qIndex = round - 1;
      if (qIndex < 0 || qIndex >= room.question_ids.length) {
        return NextResponse.json({ error: 'Invalid round' }, { status: 400 });
      }

      const questionId = room.question_ids[qIndex];
      const question = QUESTIONS.find((q) => q.id === questionId);

      if (!question) {
        return NextResponse.json({ error: 'Question not found' }, { status: 404 });
      }

      return NextResponse.json({
        question: {
          id: question.id,
          options: question.options,
          audioUrl: question.audioUrl,
          youtubeId: question.youtubeId,
        },
        serverTime: Date.now(),
      });
    }
  } catch (err) {
    console.error('Question fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
