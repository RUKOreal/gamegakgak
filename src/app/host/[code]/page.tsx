'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Player, LeaderboardEntry, RoundResult } from '@/lib/types';
import { ROUND_TIME_LIMIT_MS } from '@/lib/questions';
import { sounds } from '@/lib/sound-effects';
import { AlbumArt } from '@/components/AlbumArt';
import { YouTubeAudioPlayer } from '@/components/YouTubeAudioPlayer';
import { AudioTrackPlayer } from '@/components/AudioTrackPlayer';
import { getRiderImage } from '@/lib/rider-images';

type GamePhase = 'lobby' | 'playing' | 'round_end' | 'finished';

interface QuestionData {
  id: number;
  options: string[];
  audioUrl: string;
  youtubeId?: string;
  themeColor?: string;
  era?: string;
}

interface RoundEndData {
  correctIndex: number;
  songTitle: string;
  series: string;
  artist: string;
  albumTitle?: string;
  era?: string;
  themeColor?: string;
  coverUrl?: string;
  youtubeId?: string;
  audioUrl?: string;
  leaderboard: LeaderboardEntry[];
  roundResults: RoundResult[];
  isGameOver?: boolean;
}

const REVEAL_DURATION_SEC = 5;
const LEADERBOARD_DURATION_SEC = 6;

const AVATAR_COLORS = [
  'bg-purple-600', 'bg-cyan-600', 'bg-rose-600', 'bg-amber-600',
  'bg-emerald-600', 'bg-blue-600', 'bg-pink-600', 'bg-indigo-600',
  'bg-teal-600', 'bg-orange-600',
];

export default function HostPage() {
  const params = useParams();
  const roomCode = (params.code as string)?.toUpperCase();

  const [hostId, setHostId] = useState<string>('');
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(10);
  const [songCount, setSongCount] = useState(10);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_LIMIT_MS / 1000);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [roundEndData, setRoundEndData] = useState<RoundEndData | null>(null);
  const [roundEndStage, setRoundEndStage] = useState<'reveal' | 'leaderboard'>('reveal');
  const [stageTimerLeft, setStageTimerLeft] = useState<number>(REVEAL_DURATION_SEC);
  const [randomizeAudioSection, setRandomizeAudioSection] = useState<boolean>(true);
  const [finalLeaderboard, setFinalLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [roundStartTime, setRoundStartTime] = useState(0);
  const [demoMode, setDemoMode] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stageStartTimeRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hasAutoEndedRef = useRef(false);
  const lastTickSecondRef = useRef(-1);

  // Check if we're in demo mode
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => setDemoMode(data.demoMode))
      .catch(() => setDemoMode(true));
  }, []);

  // Load host info from session
  useEffect(() => {
    const storedHostId = sessionStorage.getItem('hostId');
    if (storedHostId) setHostId(storedHostId);
  }, []);

  // Fetch players and room status
  const fetchPlayers = useCallback(async () => {
    if (!roomCode) return;
    try {
      const res = await fetch(`/api/rooms/${roomCode}`);
      const data = await res.json();
      if (data.players) {
        setPlayers(data.players.filter((p: Player) => !p.is_host));
      }
      if (data.answeredCount !== undefined) {
        setAnsweredCount(data.answeredCount);
      }
      if (data.room) {
        if (phase === 'lobby' && data.room.status !== 'lobby') {
          setPhase(data.room.status);
        }
      }
      return data;
    } catch (err) {
      console.error('Failed to fetch players:', err);
    }
  }, [roomCode, phase]);

  // Initial fetch
  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  // Real-time: Supabase channels OR polling (demo mode)
  useEffect(() => {
    if (!roomCode) return;

    if (demoMode) {
      // Poll every 1s during game for responsive real-time experience
      pollRef.current = setInterval(() => {
        fetchPlayers();
      }, 1000);

      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    } else {
      const channel = supabase
        .channel(`room-${roomCode}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players' },
          () => { fetchPlayers(); }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'answers' },
          () => {
            fetchPlayers();
          }
        )
        .subscribe();

      channelRef.current = channel;

      return () => {
        channel.unsubscribe();
      };
    }
  }, [roomCode, fetchPlayers, demoMode]);

  // Auto-end round when all players answered
  useEffect(() => {
    if (phase === 'playing' && players.length > 0 && answeredCount >= players.length && !hasAutoEndedRef.current) {
      hasAutoEndedRef.current = true;
      const timer = setTimeout(() => {
        handleEndRound();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [phase, answeredCount, players.length]);

  // Timer countdown
  useEffect(() => {
    if (phase !== 'playing' || !roundStartTime) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - roundStartTime;
      const remaining = Math.max(0, (ROUND_TIME_LIMIT_MS - elapsed) / 1000);
      setTimeLeft(remaining);

      const sec = Math.ceil(remaining);
      if (sec !== lastTickSecondRef.current) {
        lastTickSecondRef.current = sec;
        if (sec <= 5 && sec > 0) {
          sounds.playUrgentTick();
        } else if (sec > 5 && sec % 5 === 0) {
          sounds.playTick();
        }
      }

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        if (!hasAutoEndedRef.current) {
          hasAutoEndedRef.current = true;
          handleEndRound();
        }
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, roundStartTime]);

  // Start game
  const handleStartGame = async () => {
    setLoading(true);
    setError('');
    hasAutoEndedRef.current = false;

    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, hostId, songCount }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      sounds.playStart();
      setPhase('playing');
      setCurrentRound(data.currentRound);
      setTotalRounds(data.totalRounds);
      setQuestion(data.question);
      setRoundStartTime(data.startTime);
      setTimeLeft(ROUND_TIME_LIMIT_MS / 1000);
      setAnsweredCount(0);

      // Broadcast game started to players via Supabase channel
      channelRef.current?.send({
        type: 'broadcast',
        event: 'game_event',
        payload: {
          type: 'game_started',
          totalRounds: data.totalRounds,
          currentRound: data.currentRound,
          question: data.question,
          startTime: data.startTime,
        },
      });
    } catch {
      setError('Failed to start game');
    } finally {
      setLoading(false);
    }
  };

  // End round
  const handleEndRound = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/game/end-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, hostId }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      sounds.playCorrect();
      setPhase('round_end');
      setRoundEndStage('reveal');
      setStageTimerLeft(REVEAL_DURATION_SEC);
      stageStartTimeRef.current = Date.now();

      const endData: RoundEndData = {
        correctIndex: data.currentQuestion?.correctIndex ?? 0,
        songTitle: data.currentQuestion?.songTitle ?? '',
        series: data.currentQuestion?.series ?? '',
        artist: data.currentQuestion?.artist ?? '',
        albumTitle: data.currentQuestion?.albumTitle,
        era: data.currentQuestion?.era,
        themeColor: data.currentQuestion?.themeColor,
        coverUrl: data.currentQuestion?.coverUrl,
        youtubeId: data.currentQuestion?.youtubeId,
        audioUrl: data.currentQuestion?.audioUrl,
        leaderboard: data.leaderboard || [],
        roundResults: data.roundResults || [],
        isGameOver: data.isGameOver,
      };

      setRoundEndData(endData);
      if (data.leaderboard) {
        setFinalLeaderboard(data.leaderboard);
      }

      channelRef.current?.send({
        type: 'broadcast',
        event: 'game_event',
        payload: {
          type: 'round_end',
          stage: 'reveal',
          leaderboard: data.leaderboard,
          currentQuestion: data.currentQuestion,
          roundResults: data.roundResults,
          isGameOver: data.isGameOver,
          duration: REVEAL_DURATION_SEC,
        },
      });
    } catch {
      setError('Failed to end round');
    } finally {
      setLoading(false);
    }
  };

  // Go to next question (after showing results)
  const handleNextQuestion = async () => {
    setLoading(true);
    hasAutoEndedRef.current = false;

    try {
      const res = await fetch('/api/game/next-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, hostId }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.isGameOver) {
        sounds.playVictory();
        setPhase('finished');
        channelRef.current?.send({
          type: 'broadcast',
          event: 'game_event',
          payload: {
            type: 'game_finished',
            leaderboard: finalLeaderboard.length > 0 ? finalLeaderboard : roundEndData?.leaderboard,
          },
        });
        return;
      }

      sounds.playStart();
      setPhase('playing');
      setTimeLeft(ROUND_TIME_LIMIT_MS / 1000);
      setAnsweredCount(0);
      setRoundEndData(null);
      setCurrentRound(data.nextRound);
      setQuestion(data.nextQuestion);
      setRoundStartTime(data.startTime);

      channelRef.current?.send({
        type: 'broadcast',
        event: 'game_event',
        payload: {
          type: 'new_question',
          currentRound: data.nextRound,
          question: data.nextQuestion,
          startTime: data.startTime,
        },
      });
    } catch {
      setError('Failed to advance to next question');
    } finally {
      setLoading(false);
    }
  };

  // Skip current countdown stage (reveal -> leaderboard -> next question)
  const handleSkipStage = () => {
    if (roundEndStage === 'reveal') {
      setRoundEndStage('leaderboard');
      setStageTimerLeft(LEADERBOARD_DURATION_SEC);
      stageStartTimeRef.current = Date.now();
      sounds.playStart();

      channelRef.current?.send({
        type: 'broadcast',
        event: 'game_event',
        payload: {
          type: 'round_stage',
          stage: 'leaderboard',
          duration: LEADERBOARD_DURATION_SEC,
        },
      });
    } else if (roundEndStage === 'leaderboard') {
      if (currentRound >= totalRounds || roundEndData?.isGameOver) {
        sounds.playVictory();
        setPhase('finished');
        channelRef.current?.send({
          type: 'broadcast',
          event: 'game_event',
          payload: {
            type: 'game_finished',
            leaderboard: finalLeaderboard.length > 0 ? finalLeaderboard : roundEndData?.leaderboard,
          },
        });
      } else {
        handleNextQuestion();
      }
    }
  };

  // Play again in same room (reset room back to lobby)
  const handlePlayAgain = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rooms/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, hostId }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      setPhase('lobby');
      setCurrentRound(0);
      setQuestion(null);
      setRoundEndData(null);
      setFinalLeaderboard([]);
      setRoundStartTime(0);
      setTimeLeft(ROUND_TIME_LIMIT_MS / 1000);
      setAnsweredCount(0);
      hasAutoEndedRef.current = false;

      channelRef.current?.send({
        type: 'broadcast',
        event: 'game_event',
        payload: {
          type: 'return_to_lobby',
          roomCode,
        },
      });

      await fetchPlayers();
    } catch {
      setError('Failed to reset room for new game');
    } finally {
      setLoading(false);
    }
  };

  // Kahoot Auto-advance Timer: Reveal -> Leaderboard -> Next Question automatically!
  useEffect(() => {
    if (phase !== 'round_end') {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      return;
    }

    stageTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - stageStartTimeRef.current) / 1000;

      if (roundEndStage === 'reveal') {
        const remaining = Math.max(0, REVEAL_DURATION_SEC - elapsed);
        setStageTimerLeft(remaining);

        if (remaining <= 0) {
          // Switch automatically to Leaderboard (คะแนนอันดับ)!
          setRoundEndStage('leaderboard');
          setStageTimerLeft(LEADERBOARD_DURATION_SEC);
          stageStartTimeRef.current = Date.now();
          sounds.playStart();

          channelRef.current?.send({
            type: 'broadcast',
            event: 'game_event',
            payload: {
              type: 'round_stage',
              stage: 'leaderboard',
              duration: LEADERBOARD_DURATION_SEC,
            },
          });
        }
      } else if (roundEndStage === 'leaderboard') {
        const remaining = Math.max(0, LEADERBOARD_DURATION_SEC - elapsed);
        setStageTimerLeft(remaining);

        if (remaining <= 0) {
          // Countdown reached 0: Run to next question automatically!
          if (stageTimerRef.current) clearInterval(stageTimerRef.current);

          if (currentRound >= totalRounds || roundEndData?.isGameOver) {
            sounds.playVictory();
            setPhase('finished');
            channelRef.current?.send({
              type: 'broadcast',
              event: 'game_event',
              payload: {
                type: 'game_finished',
                leaderboard: finalLeaderboard.length > 0 ? finalLeaderboard : roundEndData?.leaderboard,
              },
            });
          } else {
            handleNextQuestion();
          }
        }
      }
    }, 100);

    return () => {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
    };
  }, [phase, roundEndStage, currentRound, totalRounds, finalLeaderboard, roundEndData]);

  const handleToggleMute = () => {
    const muted = sounds.toggleMute();
    setIsMuted(muted);
  };

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <main className="flex-1 flex flex-col min-h-screen">
      {/* Header */}
      <header className="glass-card-static px-6 py-4 mx-4 mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center text-xl shadow-lg">
            🏍️
          </div>
          <div>
            <h1 className="text-lg font-bold brand-gradient" style={{ fontFamily: 'var(--font-display)' }}>
              RIDER QUIZ
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              {demoMode ? '🎮 Demo Mode (In-Memory)' : '⚡ Real-time (Supabase)'} • Host Screen
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Mute button */}
          <button
            onClick={handleToggleMute}
            className="p-2 rounded-lg bg-[var(--surface-glass)] border border-[var(--border-subtle)] text-sm hover:border-[var(--border-accent)] transition-all"
            title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {isMuted ? '🔇 Muted' : '🔊 Sound On'}
          </button>

          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Room Code</p>
            <p className="text-2xl font-black text-[var(--accent-primary)] tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
              {roomCode}
            </p>
          </div>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center justify-between animate-fade-in">
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} className="text-xs underline hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-4 md:p-8">
        {phase === 'lobby' && (
          <LobbyView
            roomCode={roomCode}
            players={players}
            loading={loading}
            songCount={songCount}
            onSongCountChange={setSongCount}
            randomizeSection={randomizeAudioSection}
            onRandomizeSectionChange={setRandomizeAudioSection}
            onStartGame={handleStartGame}
          />
        )}

        {phase === 'playing' && question && (
          <PlayingView
            currentRound={currentRound}
            totalRounds={totalRounds}
            question={question}
            timeLeft={timeLeft}
            answeredCount={answeredCount}
            totalPlayers={players.length}
            randomizeSection={randomizeAudioSection}
            onEndRound={handleEndRound}
          />
        )}

        {phase === 'round_end' && roundEndData && (
          <RoundEndView
            currentRound={currentRound}
            totalRounds={totalRounds}
            data={roundEndData}
            stage={roundEndStage}
            stageTimeLeft={stageTimerLeft}
            totalStageTime={roundEndStage === 'reveal' ? REVEAL_DURATION_SEC : LEADERBOARD_DURATION_SEC}
            options={question?.options || []}
            onSkip={handleSkipStage}
          />
        )}

        {phase === 'finished' && (
          <FinishedView
            leaderboard={finalLeaderboard}
            lastRoundData={roundEndData}
            onPlayAgain={handlePlayAgain}
            loading={loading}
          />
        )}
      </div>
    </main>
  );
}

// ─── Lobby View ──────────────────────────────────────────────────────

const SONG_COUNT_OPTIONS = [5, 10, 15, 20, 25, 30];

function LobbyView({
  roomCode,
  players,
  loading,
  songCount,
  onSongCountChange,
  randomizeSection,
  onRandomizeSectionChange,
  onStartGame,
}: {
  roomCode: string;
  players: Player[];
  loading: boolean;
  songCount: number;
  onSongCountChange: (count: number) => void;
  randomizeSection: boolean;
  onRandomizeSectionChange: (val: boolean) => void;
  onStartGame: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/play/${roomCode}` : '';

  const handleCopyLink = () => {
    if (joinUrl) {
      navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full space-y-8 animate-fade-in my-auto">
      {/* Code Display */}
      <div className="glass-card-static p-8 text-center space-y-4">
        <p className="text-[var(--text-muted)] text-sm uppercase tracking-widest">
          Join at <span className="text-[var(--accent-cyan)] font-semibold">{typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}</span> with code
        </p>
        <div className="room-code py-2 select-all">{roomCode}</div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={handleCopyLink}
            className="btn-secondary text-sm py-2 px-4"
            id="copy-join-link-btn"
          >
            {copied ? '✅ Copied Link!' : '📋 Copy Player Link'}
          </button>
          <a
            href={`/play/${roomCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-sm py-2 px-4"
            id="open-player-tab-btn"
          >
            📱 Open Player Tab
          </a>
        </div>
      </div>

      {/* Players List */}
      <div className="glass-card-static p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            <span>👥 Connected Riders</span>
            <span className="text-sm px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-normal">
              {players.length}
            </span>
          </h2>
          <span className="text-xs text-[var(--text-muted)]">
            {players.length === 0 ? 'Waiting for riders to join...' : 'Ready to henshin!'}
          </span>
        </div>

        {players.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-3xl animate-float">
              ⏳
            </div>
            <p className="text-[var(--text-secondary)]">No players have joined yet</p>
            <p className="text-xs text-[var(--text-muted)]">
              Scan the QR code or share the room code with your friends!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 stagger-children">
            {players.map((player, idx) => (
              <div
                key={player.player_id}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface-glass)] border border-[var(--border-subtle)]"
              >
                <div className={`player-avatar ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                  {player.nickname.charAt(0).toUpperCase()}
                </div>
                <span className="font-semibold text-lg">{player.nickname}</span>
                <span className="ml-auto text-emerald-400 text-xs flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Ready
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Song Count Selector */}
      <div className="glass-card-static p-6 space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <span>🎵 จำนวนเพลง</span>
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          เลือกจำนวนเพลงที่ต้องการเล่นในเกมนี้
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {SONG_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              onClick={() => onSongCountChange(count)}
              className={`relative p-4 rounded-xl border-2 text-center font-bold text-lg transition-all duration-200 ${
                songCount === count
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] shadow-lg shadow-purple-500/20 scale-105'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-glass)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:bg-[var(--surface-glass-hover)]'
              }`}
              id={`song-count-${count}-btn`}
            >
              {count}
              {songCount === count && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center text-[10px] text-white">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Audio Playback Section Mode */}
      <div className="glass-card-static p-6 space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          <span>🎲 ท่อนเพลงที่เล่น</span>
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          เลือกว่าจะให้สุ่มท่อนเพลง (เช่น ท่อนฮุก / ท่อนกลาง) หรือเริ่มจากต้นเพลงเสมอ
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => onRandomizeSectionChange(true)}
            className={`p-4 rounded-xl border-2 text-left font-bold transition-all duration-200 flex items-center gap-3 ${
              randomizeSection
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] shadow-lg shadow-purple-500/20 scale-[1.02]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-glass)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]'
            }`}
            id="audio-mode-random-btn"
          >
            <span className="text-3xl">🎲</span>
            <div className="flex-1">
              <p className="text-base text-white">สุ่มท่อนเพลง (แนะนำ)</p>
              <p className="text-xs text-[var(--text-muted)] font-normal">สุ่มเริ่มท่อนฮุก ท่อนร้อง หรือท่อนโซโล่ เพิ่มความท้าทาย</p>
            </div>
            {randomizeSection && <span className="text-emerald-400 text-sm font-bold">✓ เปิด</span>}
          </button>

          <button
            onClick={() => onRandomizeSectionChange(false)}
            className={`p-4 rounded-xl border-2 text-left font-bold transition-all duration-200 flex items-center gap-3 ${
              !randomizeSection
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] shadow-lg shadow-purple-500/20 scale-[1.02]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-glass)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]'
            }`}
            id="audio-mode-intro-btn"
          >
            <span className="text-3xl">▶️</span>
            <div className="flex-1">
              <p className="text-base text-white">เริ่มจากต้นเพลง (0:00)</p>
              <p className="text-xs text-[var(--text-muted)] font-normal">เล่นตั้งแต่เสียงอินโทรของเพลงเสมอ</p>
            </div>
            {!randomizeSection && <span className="text-emerald-400 text-sm font-bold">✓ เปิด</span>}
          </button>
        </div>
      </div>

      {/* Start Button */}
      <button
        onClick={onStartGame}
        disabled={loading || players.length === 0}
        className="btn-primary w-full text-xl py-6 animate-pulse-glow"
        id="start-game-btn"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-3">
            <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Starting Game...
          </span>
        ) : (
          <>
            🎵 Start Game — {songCount} เพลง ({players.length} player{players.length !== 1 ? 's' : ''})
          </>
        )}
      </button>
    </div>
  );
}

// ─── Playing View ────────────────────────────────────────────────────

function PlayingView({
  currentRound,
  totalRounds,
  question,
  timeLeft,
  answeredCount,
  totalPlayers,
  randomizeSection = true,
  onEndRound,
}: {
  currentRound: number;
  totalRounds: number;
  question: QuestionData;
  timeLeft: number;
  answeredCount: number;
  totalPlayers: number;
  randomizeSection?: boolean;
  onEndRound: () => void;
}) {
  const progress = (timeLeft / (ROUND_TIME_LIMIT_MS / 1000)) * 100;
  const circumference = 2 * Math.PI * 50;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const isUrgent = timeLeft <= 5;
  const allAnswered = totalPlayers > 0 && answeredCount >= totalPlayers;

  return (
    <div className="max-w-4xl mx-auto w-full space-y-3 animate-fade-in">
      {/* Round Info & Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[var(--text-muted)] text-xs uppercase tracking-widest">Round</p>
          <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {currentRound} <span className="text-[var(--text-muted)] text-sm">/ {totalRounds}</span>
          </p>
        </div>

        {/* Timer */}
        <div className="relative flex items-center justify-center">
          <svg className="timer-ring w-20 h-20" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="8"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke={isUrgent ? 'var(--accent-rose)' : 'var(--accent-primary)'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`text-2xl font-black ${isUrgent ? 'text-rose-400 animate-pulse' : 'text-[var(--text-primary)]'}`}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {Math.ceil(timeLeft)}
            </span>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[var(--text-muted)] text-xs uppercase tracking-widest">Answered</p>
          <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {answeredCount} <span className="text-[var(--text-muted)] text-sm">/ {totalPlayers}</span>
          </p>
        </div>
      </div>

      {allAnswered && (
        <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-center text-sm font-bold animate-pulse">
          🎉 All players answered! Revealing answer...
        </div>
      )}

      {/* Song / Audio Area */}
      <div className="glass-card-static p-3.5 relative overflow-hidden">
        <div className="text-center mb-1">
          <p className="text-[var(--accent-cyan)] font-semibold text-xs mb-0.5 animate-pulse">
            🎵 เพลงกำลังเล่นอยู่...
          </p>
          <h2 className="text-xl font-bold brand-gradient" style={{ fontFamily: 'var(--font-display)' }}>
            ไรเดอร์ตัวไหนเอ่ย?
          </h2>
        </div>

        {/* Audio Track Player */}
        <AudioTrackPlayer
          audioUrl={question.audioUrl}
          youtubeId={question.youtubeId}
          autoPlay={true}
          themeColor={question.themeColor}
          randomizeSection={randomizeSection}
          roundKey={currentRound}
        />
      </div>

      {/* Kahoot-style Options with Rider Photos (matches player's button colors) */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((option, idx) => {
          const kahootColors = [
            { bg: '#e21b3c', shape: '▲', label: 'A' },
            { bg: '#1368ce', shape: '◆', label: 'B' },
            { bg: '#d89e00', shape: '●', label: 'C' },
            { bg: '#26890c', shape: '■', label: 'D' },
          ];
          const k = kahootColors[idx];
          const riderImg = getRiderImage(option);

          return (
            <div
              key={idx}
              className="relative rounded-2xl overflow-hidden border-2 shadow-xl flex flex-col transition-all duration-200 hover:scale-[1.01]"
              style={{
                borderColor: k.bg,
                backgroundColor: 'rgba(15, 12, 35, 0.95)',
              }}
            >
              {/* Top Header Badge */}
              <div
                className="px-3.5 py-1.5 flex items-center justify-between text-white font-bold shadow-md"
                style={{ backgroundColor: k.bg }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl leading-none">{k.shape}</span>
                  <span className="text-xs uppercase tracking-wider font-extrabold">{k.label}</span>
                </div>
                <span className="text-[10px] uppercase tracking-widest font-semibold opacity-90">Kamen Rider</span>
              </div>

              {/* Rider Photo & Name Container */}
              <div className="relative h-32 sm:h-36 w-full bg-zinc-950 flex items-center justify-center overflow-hidden">
                {riderImg ? (
                  <img
                    src={riderImg}
                    alt={option}
                    className="w-full h-full object-cover object-top filter brightness-95 contrast-105"
                    loading="eager"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">
                    🏍️
                  </div>
                )}

                {/* Dark Gradient Overlay for text readability */}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black via-black/85 to-transparent pointer-events-none" />

                {/* Rider Name in bold banner */}
                <div className="absolute bottom-1.5 inset-x-2.5 pointer-events-none">
                  <p className="text-white font-black text-base sm:text-lg drop-shadow-[0_2px_4px_rgba(0,0,0,1)] truncate leading-tight">
                    {option}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Answer Progress Bar */}
      <div className="glass-card-static p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/50 uppercase tracking-wider">ตอบแล้ว</span>
          <span className="text-sm font-bold text-white">
            {answeredCount} / {totalPlayers}
          </span>
        </div>
        <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-500 ease-out"
            style={{ width: `${totalPlayers > 0 ? (answeredCount / totalPlayers) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* End Round Early Button */}
      <button
        onClick={onEndRound}
        className="btn-secondary w-full py-4 text-sm"
        id="end-round-btn"
      >
        ⏩ จบรอบ / เฉลยคำตอบ
      </button>
    </div>
  );
}

// ─── Round End View (Kahoot-Style Auto Flow) ─────────────────────────

const KAHOOT_THEME = [
  { shape: '▲', color: '#e21b3c', bg: '#e21b3c', label: 'A' },
  { shape: '◆', color: '#1368ce', bg: '#1368ce', label: 'B' },
  { shape: '●', color: '#d89e00', bg: '#d89e00', label: 'C' },
  { shape: '■', color: '#26890c', bg: '#26890c', label: 'D' },
];

function RoundEndView({
  currentRound,
  totalRounds,
  data,
  stage,
  stageTimeLeft,
  totalStageTime,
  options,
  onSkip,
}: {
  currentRound: number;
  totalRounds: number;
  data: RoundEndData;
  stage: 'reveal' | 'leaderboard';
  stageTimeLeft: number;
  totalStageTime: number;
  options: string[];
  onSkip: () => void;
}) {
  const isLastRound = currentRound >= totalRounds || data.isGameOver;
  const progressPct = Math.min(100, Math.max(0, ((totalStageTime - stageTimeLeft) / totalStageTime) * 100));

  // Compute answers per option for Kahoot distribution chart
  const answerCounts = [0, 0, 0, 0];
  data.roundResults.forEach((r) => {
    if (r.answer_index >= 0 && r.answer_index < 4) {
      answerCounts[r.answer_index]++;
    }
  });
  const maxAnswerCount = Math.max(1, ...answerCounts);

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6 animate-fade-in-up">
      {/* ─── Kahoot Auto Countdown Header ─── */}
      <div className="glass-card-static p-4 border-2 border-purple-500/30">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl animate-pulse">
              {stage === 'reveal' ? '🎯' : '🏆'}
            </span>
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-purple-300">
                {stage === 'reveal' ? 'เฉลยคำตอบ (Answer Reveal)' : 'ตารางคะแนน (Leaderboard)'} • Round {currentRound} / {totalRounds}
              </p>
              <p className="text-sm font-bold text-white">
                {stage === 'reveal'
                  ? `กำลังจะแสดงคะแนนอันดับใน ${Math.ceil(stageTimeLeft)} วินาที...`
                  : isLastRound
                  ? `👑 เตรียมประกาศผู้ชนะเลิศใน ${Math.ceil(stageTimeLeft)} วินาที...`
                  : `⚡ รันข้อต่อไปใน ${Math.ceil(stageTimeLeft)} วินาที...`}
              </p>
            </div>
          </div>

          {/* Quick Skip button (optional fast-forward) */}
          <button
            onClick={onSkip}
            className="text-xs py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium transition-all flex items-center gap-1 shrink-0"
            title="ข้ามเวลารอ"
          >
            {stage === 'reveal' ? 'ดูคะแนน ⏩' : isLastRound ? 'ดูผู้ชนะ 🏆' : 'ข้อต่อไป ⏩'}
          </button>
        </div>

        {/* Animated Progress Bar */}
        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400 transition-all duration-100 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ─── Stage 1: Reveal (เฉลย) ─── */}
      {stage === 'reveal' && (
        <div className="space-y-6 animate-fade-in">
          {/* Answer Reveal Hero */}
          <div className="glass-card-static p-6 text-center space-y-3 relative overflow-hidden">
            <div className="absolute top-3 right-4 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold animate-pulse">
              ✓ เฉลยข้อที่ {currentRound}
            </div>

            {/* 3D Vinyl Album Cover */}
            <div className="flex justify-center my-3">
              <AlbumArt
                songTitle={data.songTitle}
                series={data.series}
                artist={data.artist}
                albumTitle={data.albumTitle}
                era={data.era}
                themeColor={data.themeColor}
                coverUrl={data.coverUrl}
                size="lg"
                showVinyl={true}
                isSpinning={true}
              />
            </div>

            <h2 className="text-3xl font-black brand-gradient" style={{ fontFamily: 'var(--font-display)' }}>
              {data.songTitle}
            </h2>
            <p className="text-2xl font-bold text-[var(--accent-cyan)]">{data.series}</p>
            <p className="text-sm text-[var(--text-muted)]">Performed by {data.artist}</p>

            {/* Video Clip or Audio playback */}
            {data.youtubeId && data.youtubeId !== 'PLACEHOLDER' ? (
              <div className="video-container max-w-xl mx-auto mt-4 shadow-2xl rounded-xl overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${data.youtubeId}?autoplay=1&start=0`}
                  title="Opening Video"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              </div>
            ) : data.audioUrl ? (
              <div className="max-w-md mx-auto mt-4 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                <div className="flex items-center justify-between mb-1.5 text-xs text-cyan-300">
                  <span>🎧 เล่นเพลงเฉลย</span>
                  <span>MP3 Audio</span>
                </div>
                <audio src={data.audioUrl} controls autoPlay className="w-full h-9" />
              </div>
            ) : null}
          </div>

          {/* Kahoot Answer Distribution Grid */}
          <div className="glass-card-static p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 flex items-center justify-between">
              <span>📊 ผลการตอบคำถาม</span>
              <span className="text-xs text-white/40">
                ตอบทั้งหมด {data.roundResults.length} คน
              </span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {KAHOOT_THEME.map((k, idx) => {
                const count = answerCounts[idx];
                const isCorrect = idx === data.correctIndex;
                const optionText = options[idx] || `ตัวเลือก ${k.label}`;
                const barWidth = data.roundResults.length > 0 ? (count / maxAnswerCount) * 100 : 0;

                return (
                  <div
                    key={idx}
                    className={`relative p-4 rounded-xl border-2 transition-all overflow-hidden ${
                      isCorrect
                        ? 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_20px_rgba(52,211,153,0.3)]'
                        : 'border-white/10 bg-white/5 opacity-50'
                    }`}
                  >
                    {/* Background response bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-white/10 transition-all duration-700 pointer-events-none"
                      style={{ width: `${barWidth}%` }}
                    />

                    <div className="relative z-10 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-lg shrink-0 shadow-md"
                          style={{ backgroundColor: k.bg }}
                        >
                          {k.shape}
                        </span>
                        {getRiderImage(optionText) && (
                          <img
                            src={getRiderImage(optionText)}
                            alt={optionText}
                            className="w-10 h-10 rounded-lg object-cover border border-white/20 shrink-0 shadow-md"
                          />
                        )}
                        <div className="min-w-0">
                          <p className={`font-bold text-base truncate ${isCorrect ? 'text-emerald-300' : 'text-white'}`}>
                            {optionText}
                          </p>
                          {isCorrect && (
                            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                              ✓ คำตอบที่ถูกต้อง
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-lg font-black ${isCorrect ? 'text-emerald-300' : 'text-white/70'}`}>
                          {count}
                        </span>
                        <span className="text-xs text-white/40 block">คน</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Players answer round list */}
          <div className="glass-card-static p-6 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">
              รายชื่อผู้เล่นที่ตอบรอบนี้
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.roundResults.map((result, idx) => (
                <div
                  key={result.player_id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                    result.is_correct
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : 'border-rose-500/20 bg-rose-500/5'
                  }`}
                >
                  <div className={`player-avatar w-8 h-8 text-sm ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                    {result.nickname.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{result.nickname}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs font-semibold ${result.is_correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {result.is_correct ? '✅ ตอบถูก' : '❌ ตอบผิด'}
                      </span>
                      <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-700/50 px-2 py-0.5 rounded shadow-sm">
                        ⏱️ {(result.time_taken_ms / 1000).toFixed(2)}s
                      </span>
                    </div>
                  </div>
                  <span className={`font-bold text-sm ${result.is_correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                    +{result.score_earned}
                  </span>
                </div>
              ))}
              {data.roundResults.length === 0 && (
                <p className="text-center text-[var(--text-muted)] py-4 text-xs">
                  ไม่มีผู้เล่นตอบในรอบนี้
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Stage 2: Leaderboard (แสดงคะแนนอันดับ) ─── */}
      {stage === 'leaderboard' && (
        <div className="space-y-6 animate-fade-in">
          {/* Kahoot-style Scoreboard Card */}
          <div className="glass-card-static p-8 space-y-4">
            <div className="text-center space-y-1 mb-6">
              <span className="text-4xl animate-bounce">🏆</span>
              <h2 className="text-3xl font-black brand-gradient" style={{ fontFamily: 'var(--font-display)' }}>
                อันดับคะแนน (LEADERBOARD)
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                คะแนนสะสมหลังจบข้อที่ {currentRound} / {totalRounds}
              </p>
            </div>

            {/* Scoreboard List */}
            <div className="space-y-3 stagger-children">
              {data.leaderboard.map((entry, idx) => {
                const roundResult = data.roundResults.find((r) => r.player_id === entry.player_id);
                const scoreEarned = roundResult?.score_earned || 0;
                const isCorrect = roundResult?.is_correct || false;

                const isTop1 = idx === 0;
                const isTop2 = idx === 1;
                const isTop3 = idx === 2;

                return (
                  <div
                    key={entry.player_id}
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${
                      isTop1
                        ? 'border-amber-400/60 bg-gradient-to-r from-amber-500/20 via-purple-900/30 to-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.25)] scale-[1.02]'
                        : isTop2
                        ? 'border-slate-300/40 bg-gradient-to-r from-slate-400/15 via-purple-900/20 to-slate-400/5'
                        : isTop3
                        ? 'border-amber-700/40 bg-gradient-to-r from-amber-700/15 via-purple-900/20 to-amber-700/5'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-glass)]'
                    }`}
                  >
                    {/* Rank Badge */}
                    <div className="w-10 text-center font-black text-2xl shrink-0">
                      {isTop1 ? '👑' : isTop2 ? '🥈' : isTop3 ? '🥉' : `#${idx + 1}`}
                    </div>

                    {/* Avatar */}
                    <div className={`player-avatar w-12 h-12 text-lg shrink-0 ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                      {entry.nickname.charAt(0).toUpperCase()}
                    </div>

                    {/* Name & Streak */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-white truncate">
                          {entry.nickname}
                        </span>
                        {isCorrect && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 font-semibold flex items-center gap-1">
                            🔥 Hot
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {isTop1 ? 'อันดับ 1 ผู้นำ!' : `อันดับที่ ${idx + 1}`}
                      </p>
                    </div>

                    {/* Round Points & Total Score */}
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {scoreEarned > 0 && (
                          <span className="text-xs font-bold text-emerald-400 animate-score-pop">
                            +{scoreEarned}
                          </span>
                        )}
                        {roundResult && (
                          <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-700/50 px-2 py-0.5 rounded-md shadow-sm">
                            ⏱️ {(roundResult.time_taken_ms / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-amber-400" style={{ fontFamily: 'var(--font-display)' }}>
                          {entry.score.toLocaleString()}
                        </span>
                        <span className="text-xs text-white/40">pts</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {data.leaderboard.length === 0 && (
                <p className="text-center text-[var(--text-muted)] py-8">ยังไม่มีคะแนน</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Finished View ───────────────────────────────────────────────────

function FinishedView({
  leaderboard,
  lastRoundData,
  onPlayAgain,
  loading,
}: {
  leaderboard: LeaderboardEntry[];
  lastRoundData: RoundEndData | null;
  onPlayAgain: () => void;
  loading: boolean;
}) {
  const winner = leaderboard[0];

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6 animate-fade-in-up">
      {/* Last round answer */}
      {lastRoundData && (
        <div className="glass-card-static p-6 text-center space-y-3">
          <p className="text-[var(--text-muted)] text-sm">Final Round Track</p>
          <div className="flex justify-center my-2">
            <AlbumArt
              songTitle={lastRoundData.songTitle}
              series={lastRoundData.series}
              artist={lastRoundData.artist}
              albumTitle={lastRoundData.albumTitle}
              era={lastRoundData.era}
              themeColor={lastRoundData.themeColor}
              coverUrl={lastRoundData.coverUrl}
              size="md"
              showVinyl={true}
              isSpinning={false}
            />
          </div>
          <h3 className="text-2xl font-bold brand-gradient">{lastRoundData.songTitle}</h3>
          <p className="text-[var(--text-secondary)]">{lastRoundData.series}</p>
        </div>
      )}

      {/* Winner Podium */}
      <div className="glass-card-static p-10 text-center space-y-4">
        <div className="text-7xl mb-2 animate-float">👑</div>
        <p className="text-[var(--text-muted)] text-sm uppercase tracking-widest">
          Champion Kamen Rider
        </p>
        {winner ? (
          <>
            <h2 className="text-5xl font-black brand-gradient" style={{ fontFamily: 'var(--font-display)' }}>
              {winner.nickname}
            </h2>
            <p className="text-3xl font-bold text-amber-400 animate-score-pop">
              {winner.score.toLocaleString()} pts
            </p>
          </>
        ) : (
          <p className="text-[var(--text-muted)]">No players scored</p>
        )}
      </div>

      {/* Final Leaderboard */}
      <LeaderboardCard leaderboard={leaderboard} title="Final Standings" />

      {/* Host Action Buttons: Play Again (same room) or Exit */}
      <div className="space-y-3 pt-2">
        <button
          onClick={onPlayAgain}
          disabled={loading}
          className="btn-primary w-full text-xl py-5 shadow-2xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all"
          id="host-play-again-btn"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              กำลังเตรียมห้อง...
            </span>
          ) : (
            <>
              <span className="text-2xl">🔄</span>
              <span>เล่นใหม่อีกรอบ (ห้องเดิม)</span>
            </>
          )}
        </button>

        <button
          onClick={() => (window.location.href = '/')}
          className="btn-secondary w-full text-base py-3.5 flex items-center justify-center gap-2 text-white/70 hover:text-white"
          id="host-exit-room-btn"
        >
          <span>🚪</span>
          <span>ออกจากห้อง (กลับหน้าแรก)</span>
        </button>
      </div>
    </div>
  );
}

// ─── Shared Leaderboard Card ─────────────────────────────────────────

function LeaderboardCard({
  leaderboard,
  title = 'Leaderboard',
}: {
  leaderboard: LeaderboardEntry[];
  title?: string;
}) {
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="glass-card-static p-6">
      <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
        {title}
      </h3>
      <div className="space-y-2 stagger-children">
        {leaderboard.map((entry, idx) => (
          <div
            key={entry.player_id}
            className={`leaderboard-row ${idx < 3 ? `rank-${idx + 1}` : ''}`}
          >
            <span className="text-2xl w-10 text-center">
              {idx < 3 ? medals[idx] : <span className="text-[var(--text-muted)] text-lg">#{entry.rank}</span>}
            </span>
            <div className={`player-avatar ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
              {entry.nickname.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold flex-1">{entry.nickname}</span>
            <span className="text-xl font-bold text-amber-400">
              {entry.score.toLocaleString()}
            </span>
          </div>
        ))}
        {leaderboard.length === 0 && (
          <p className="text-center text-[var(--text-muted)] py-4">No scores yet</p>
        )}
      </div>
    </div>
  );
}
