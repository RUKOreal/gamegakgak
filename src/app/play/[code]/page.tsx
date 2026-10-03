'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { LeaderboardEntry, RoundResult } from '@/lib/types';
import { ROUND_TIME_LIMIT_MS } from '@/lib/questions';
import { sounds } from '@/lib/sound-effects';
import { AlbumArt } from '@/components/AlbumArt';
import { getRiderImage } from '@/lib/rider-images';

type PlayerPhase = 'waiting' | 'playing' | 'answered' | 'round_end' | 'finished';

interface QuestionData {
  id: number;
  options: string[];
  audioUrl: string;
  youtubeId?: string;
  themeColor?: string;
  era?: string;
}

interface RoundEndInfo {
  songTitle: string;
  series: string;
  artist: string;
  albumTitle?: string;
  era?: string;
  themeColor?: string;
  coverUrl?: string;
  correctIndex: number;
  leaderboard: LeaderboardEntry[];
  roundResults: RoundResult[];
  audioUrl?: string;
  youtubeId?: string;
}

interface RoomState {
  status: string;
  current_round: number;
  total_rounds: number;
  current_question_index: number;
  round_start_time: number | null;
  question_ids?: number[];
}

// ─── Kahoot-style answer button config ────────────────────────────
const KAHOOT_OPTIONS = [
  { shape: '▲', color: '#e21b3c', bgClass: 'bg-[#e21b3c]', hoverClass: 'hover:bg-[#c9182f]', label: 'A' },
  { shape: '◆', color: '#1368ce', bgClass: 'bg-[#1368ce]', hoverClass: 'hover:bg-[#0f56ab]', label: 'B' },
  { shape: '●', color: '#d89e00', bgClass: 'bg-[#d89e00]', hoverClass: 'hover:bg-[#c08d00]', label: 'C' },
  { shape: '■', color: '#26890c', bgClass: 'bg-[#26890c]', hoverClass: 'hover:bg-[#1e700a]', label: 'D' },
];

export default function PlayerPage() {
  const params = useParams();
  const roomCode = (params.code as string)?.toUpperCase();

  const [playerId, setPlayerId] = useState<string>('');
  const [nickname, setNickname] = useState<string>('');
  const [phase, setPhase] = useState<PlayerPhase>('waiting');
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(10);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<{
    isCorrect: boolean;
    scoreEarned: number;
    correctIndex: number;
    timeTakenMs?: number;
  } | null>(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_LIMIT_MS / 1000);
  const [roundEndInfo, setRoundEndInfo] = useState<RoundEndInfo | null>(null);
  const [roundEndStage, setRoundEndStage] = useState<'reveal' | 'leaderboard'>('reveal');
  const [stageTimerLeft, setStageTimerLeft] = useState<number>(5);
  const [finalLeaderboard, setFinalLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myTotalScore, setMyTotalScore] = useState(0);
  const [roundStartTime, setRoundStartTime] = useState(0);
  const [demoMode, setDemoMode] = useState(false);
  const [lastKnownRound, setLastKnownRound] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [revealAudioPlaying, setRevealAudioPlaying] = useState(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const revealAudioRef = useRef<HTMLAudioElement | null>(null);
  const isAudioUnlockedRef = useRef(false);
  const currentAudioUrlRef = useRef<string>('');
  const offsetRoundRef = useRef<number>(-1);
  const roundStartOffsetRef = useRef<number>(0);
  const questionRenderTimeRef = useRef<number>(0);
  const serverClockOffsetRef = useRef<number>(0);
  const stageStartTimeRef = useRef<number>(0);

  // Helper to calculate a safe random start section in the track
  const calculateRandomOffset = useCallback((dur: number): number => {
    if (isNaN(dur) || dur <= 0) return 0;
    // Round limit is ~15s, leave 18s at end so song doesn't finish prematurely
    const maxStart = Math.max(0, Math.floor(dur - 18));
    if (maxStart <= 5) return 0;
    return 5 + Math.floor(Math.random() * (maxStart - 5));
  }, []);

  // Proactive audio unlock for mobile Safari & Chrome
  const unlockAudio = useCallback(() => {
    sounds.unlock();

    const audio = audioRef.current;
    if (!audio) return;

    if ((phase === 'playing' || phase === 'answered') && question?.audioUrl) {
      if (audio.paused && !isMuted) {
        audio.play().then(() => {
          setIsPlayingMusic(true);
          setAutoplayBlocked(false);
        }).catch(() => {});
      }
    } else if (!isAudioUnlockedRef.current) {
      const prevSrc = audio.getAttribute('src');
      if (!prevSrc) {
        audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        audio.play().then(() => {
          audio.pause();
          audio.removeAttribute('src');
          isAudioUnlockedRef.current = true;
          setIsAudioUnlocked(true);
        }).catch(() => {});
      } else {
        isAudioUnlockedRef.current = true;
        setIsAudioUnlocked(true);
      }
    }
  }, [phase, question?.audioUrl, isMuted]);

  // Pre-unlock audio on any first interaction (touch/tap/click/key)
  useEffect(() => {
    const handleFirstInteraction = () => {
      unlockAudio();
    };

    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', handleFirstInteraction, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [unlockAudio]);

  // Direct join states
  const [isJoined, setIsJoined] = useState(false);
  const [checkingRoom, setCheckingRoom] = useState(true);
  const [roomError, setRoomError] = useState('');
  const [inputNickname, setInputNickname] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [roomStatus, setRoomStatus] = useState('lobby');

  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTickSecondRef = useRef(-1);

  // Check room status and player registration on mount
  useEffect(() => {
    let isMounted = true;

    async function checkRoomAndPlayer() {
      if (!roomCode) {
        setRoomError('Invalid room code');
        setCheckingRoom(false);
        return;
      }

      const storedPlayerId = sessionStorage.getItem('playerId');
      const storedNickname = sessionStorage.getItem('nickname');
      const storedRoomCode = sessionStorage.getItem('roomCode');

      try {
        const t0 = Date.now();
        const res = await fetch(`/api/rooms/${roomCode}`);
        const data = await res.json();
        const t1 = Date.now();

        if (!isMounted) return;

        if (data.serverTime) {
          const rtt = Math.max(0, t1 - t0);
          serverClockOffsetRef.current = Math.round(data.serverTime + rtt / 2 - t1);
        }

        if (!res.ok || data.error || !data.room) {
          setRoomError(data.error || 'ไม่พบห้องนี้ (Room not found)');
          setCheckingRoom(false);
          return;
        }

        setRoomStatus(data.room.status);

        // Check if player is already registered in this room
        const isRegistered =
          storedPlayerId &&
          storedRoomCode === roomCode &&
          data.players?.some((p: { player_id: string }) => p.player_id === storedPlayerId);

        if (isRegistered && storedPlayerId && storedNickname) {
          setPlayerId(storedPlayerId);
          setNickname(storedNickname);
          setIsJoined(true);
        } else {
          // Player not joined yet
          setIsJoined(false);
        }
      } catch (err) {
        if (isMounted) setRoomError('ไม่สามารถเชื่อมต่อห้องได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        if (isMounted) setCheckingRoom(false);
      }
    }

    checkRoomAndPlayer();

    return () => {
      isMounted = false;
    };
  }, [roomCode]);

  // Check if demo mode
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => setDemoMode(data.demoMode))
      .catch(() => setDemoMode(true));
  }, []);

  // Poll room state in demo mode to detect game start, round end & next rounds
  const pollRoomState = useCallback(async () => {
    if (!roomCode) return;
    try {
      const t0 = Date.now();
      const res = await fetch(`/api/rooms/${roomCode}`);
      const data = await res.json();
      const t1 = Date.now();
      if (!data.room) return;

      if (data.serverTime) {
        const rtt = Math.max(0, t1 - t0);
        serverClockOffsetRef.current = Math.round(data.serverTime + rtt / 2 - t1);
      }

      const room: RoomState = data.room;

      if (room.status === 'lobby') {
        if (phase !== 'waiting') {
          setPhase('waiting');
          setCurrentRound(0);
          setQuestion(null);
          setSelectedAnswer(null);
          setAnswerResult(null);
          setRoundEndInfo(null);
          setMyTotalScore(0);
          setFinalLeaderboard([]);
          setLastKnownRound(0);
        }
      } else if (room.status === 'playing') {
        if (phase === 'waiting' || room.current_round > lastKnownRound) {
          // New round started!
          sounds.playStart();
          setPhase('playing');
          setTotalRounds(room.total_rounds);
          setCurrentRound(room.current_round);
          const startTs = room.round_start_time || Date.now();
          setRoundStartTime(startTs);
          const syncedNow = Date.now() + serverClockOffsetRef.current;
          const elapsedSec = Math.max(0, (syncedNow - startTs) / 1000);
          setTimeLeft(Math.max(0, (ROUND_TIME_LIMIT_MS / 1000) - elapsedSec));
          setSelectedAnswer(null);
          setAnswerResult(null);
          setRoundEndInfo(null);
          setLastKnownRound(room.current_round);

          const qT0 = Date.now();
          const qRes = await fetch(`/api/game/question?roomCode=${roomCode}&round=${room.current_round}`);
          const qT1 = Date.now();
          if (qRes.ok) {
            const qData = await qRes.json();
            if (qData.serverTime) {
              const rtt = Math.max(0, qT1 - qT0);
              serverClockOffsetRef.current = Math.round(qData.serverTime + rtt / 2 - qT1);
            }
            setQuestion(qData.question);
          }
        }
      } else if (room.status === 'round_end') {
        // Round ended!
        if (phase !== 'round_end') {
          setPhase('round_end');
        }
        if (data.roundEndData) {
          const endData = data.roundEndData;
          setRoundEndInfo(endData);
          if (playerId && endData.leaderboard) {
            const me = endData.leaderboard.find(
              (e: LeaderboardEntry) => e.player_id === playerId
            );
            if (me) setMyTotalScore(me.score);
          }

          // Calculate current stage & countdown using synced clock
          const syncedNow = Date.now() + serverClockOffsetRef.current;
          const elapsed = endData.roundEndTime ? Math.max(0, (syncedNow - endData.roundEndTime) / 1000) : 0;
          if (elapsed < 5) {
            setRoundEndStage('reveal');
            setStageTimerLeft(Math.max(0, 5 - elapsed));
            stageStartTimeRef.current = Date.now() - (elapsed * 1000);
          } else {
            setRoundEndStage('leaderboard');
            setStageTimerLeft(Math.max(0, 11 - elapsed));
            stageStartTimeRef.current = Date.now() - ((elapsed - 5) * 1000);
          }
        }
      } else if (room.status === 'finished' && phase !== 'finished') {
        sounds.playVictory();
        setPhase('finished');

        if (data.roundEndData) {
          setRoundEndInfo(data.roundEndData);
          setFinalLeaderboard(data.roundEndData.leaderboard || []);
          if (playerId && data.roundEndData.leaderboard) {
            const me = data.roundEndData.leaderboard.find(
              (e: LeaderboardEntry) => e.player_id === playerId
            );
            if (me) setMyTotalScore(me.score);
          }
        } else {
          const players = data.players || [];
          const nonHostPlayers = players
            .filter((p: { is_host: boolean }) => !p.is_host)
            .sort((a: { score: number }, b: { score: number }) => b.score - a.score);
          setFinalLeaderboard(
            nonHostPlayers.map((p: { player_id: string; nickname: string; score: number }, idx: number) => ({
              player_id: p.player_id,
              nickname: p.nickname,
              score: p.score,
              rank: idx + 1,
            }))
          );
          if (playerId) {
            const me = nonHostPlayers.find((p: { player_id: string }) => p.player_id === playerId);
            if (me) setMyTotalScore(me.score);
          }
        }
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  }, [roomCode, phase, lastKnownRound, playerId]);

  // Subscribe to game events via Supabase broadcast with resilient background polling fallback
  useEffect(() => {
    if (!roomCode || !isJoined) return;

    // Periodic polling fallback (every 1s in demoMode, every 2.5s in Supabase mode)
    const intervalMs = demoMode ? 1000 : 2500;
    pollRef.current = setInterval(() => {
      pollRoomState();
    }, intervalMs);

    pollRoomState();

    if (!demoMode) {
      const channel = supabase
        .channel(`room-${roomCode}`)
        .on('broadcast', { event: 'game_event' }, ({ payload }) => {
          handleGameEvent(payload);
        })
        .subscribe();

      channelRef.current = channel;

      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        channel.unsubscribe();
      };
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isJoined, demoMode, pollRoomState]);

  // Handle game events from host (Supabase mode)
  const handleGameEvent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (payload: any) => {
      switch (payload.type) {
        case 'return_to_lobby':
          sounds.playStart();
          setPhase('waiting');
          setCurrentRound(0);
          setQuestion(null);
          setSelectedAnswer(null);
          setAnswerResult(null);
          setRoundEndInfo(null);
          setMyTotalScore(0);
          setFinalLeaderboard([]);
          setLastKnownRound(0);
          break;

        case 'game_started': {
          sounds.playStart();
          setPhase('playing');
          setTotalRounds(payload.totalRounds);
          setCurrentRound(payload.currentRound);
          setQuestion(payload.question);
          setRoundStartTime(payload.startTime);
          const syncedNowStart = Date.now() + serverClockOffsetRef.current;
          const elapsedSecStart = Math.max(0, (syncedNowStart - payload.startTime) / 1000);
          setTimeLeft(Math.max(0, (ROUND_TIME_LIMIT_MS / 1000) - elapsedSecStart));
          setSelectedAnswer(null);
          setAnswerResult(null);
          break;
        }

        case 'new_question': {
          sounds.playStart();
          setPhase('playing');
          setCurrentRound(payload.currentRound);
          setQuestion(payload.question);
          setRoundStartTime(payload.startTime);
          const syncedNowQ = Date.now() + serverClockOffsetRef.current;
          const elapsedSecQ = Math.max(0, (syncedNowQ - payload.startTime) / 1000);
          setTimeLeft(Math.max(0, (ROUND_TIME_LIMIT_MS / 1000) - elapsedSecQ));
          setSelectedAnswer(null);
          setAnswerResult(null);
          setRoundEndInfo(null);
          break;
        }

        case 'round_end':
          setPhase('round_end');
          setRoundEndStage(payload.stage || 'reveal');
          setStageTimerLeft(payload.duration || 5);
          stageStartTimeRef.current = Date.now();
          setRoundEndInfo({
            songTitle: payload.currentQuestion?.songTitle || '',
            series: payload.currentQuestion?.series || '',
            artist: payload.currentQuestion?.artist || '',
            albumTitle: payload.currentQuestion?.albumTitle,
            era: payload.currentQuestion?.era,
            themeColor: payload.currentQuestion?.themeColor,
            coverUrl: payload.currentQuestion?.coverUrl,
            correctIndex: payload.currentQuestion?.correctIndex ?? -1,
            leaderboard: payload.leaderboard || [],
            roundResults: payload.roundResults || [],
            audioUrl: payload.currentQuestion?.audioUrl,
            youtubeId: payload.currentQuestion?.youtubeId,
          });
          if (playerId && payload.leaderboard) {
            const me = payload.leaderboard.find(
              (e: LeaderboardEntry) => e.player_id === playerId
            );
            if (me) setMyTotalScore(me.score);
          }
          break;

        case 'round_stage':
          if (payload.stage === 'leaderboard') {
            setRoundEndStage('leaderboard');
            setStageTimerLeft(payload.duration || 6);
            stageStartTimeRef.current = Date.now();
            sounds.playStart();
          }
          break;

        case 'game_finished':
          sounds.playVictory();
          setPhase('finished');
          setFinalLeaderboard(payload.leaderboard);
          if (payload.currentQuestion) {
            setRoundEndInfo({
              songTitle: payload.currentQuestion?.songTitle || '',
              series: payload.currentQuestion?.series || '',
              artist: payload.currentQuestion?.artist || '',
              albumTitle: payload.currentQuestion?.albumTitle,
              era: payload.currentQuestion?.era,
              themeColor: payload.currentQuestion?.themeColor,
              coverUrl: payload.currentQuestion?.coverUrl,
              correctIndex: payload.currentQuestion?.correctIndex ?? -1,
              leaderboard: payload.leaderboard || [],
              roundResults: payload.roundResults || [],
              audioUrl: payload.currentQuestion?.audioUrl,
              youtubeId: payload.currentQuestion?.youtubeId,
            });
          }
          if (playerId && payload.leaderboard) {
            const me = payload.leaderboard.find(
              (e: LeaderboardEntry) => e.player_id === playerId
            );
            if (me) setMyTotalScore(me.score);
          }
          break;
      }
    },
    [playerId]
  );

  // High-precision question render time for reaction tracking
  useEffect(() => {
    if (phase === 'playing' && question) {
      questionRenderTimeRef.current = performance.now();
    }
  }, [phase, question]);

  // Auto Countdown timer for round_end stages in player (resilient to mobile timer throttling)
  useEffect(() => {
    if (phase !== 'round_end') {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      return;
    }

    if (!stageStartTimeRef.current) {
      stageStartTimeRef.current = Date.now();
    }

    stageTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - stageStartTimeRef.current) / 1000;
      if (roundEndStage === 'reveal') {
        const remaining = Math.max(0, 5 - elapsed);
        setStageTimerLeft(remaining);
        if (remaining <= 0) {
          setRoundEndStage('leaderboard');
          setStageTimerLeft(6);
          stageStartTimeRef.current = Date.now();
          sounds.playStart();
        }
      } else {
        const remaining = Math.max(0, 6 - elapsed);
        setStageTimerLeft(remaining);
      }
    }, 100);

    return () => {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
    };
  }, [phase, roundEndStage]);

  // Timer countdown (calibrated to synchronized server time)
  useEffect(() => {
    if (phase !== 'playing' || !roundStartTime) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const syncedNow = Date.now() + serverClockOffsetRef.current;
      const elapsed = syncedNow - roundStartTime;
      const remaining = Math.max(0, (ROUND_TIME_LIMIT_MS - elapsed) / 1000);
      setTimeLeft(remaining);

      const sec = Math.ceil(remaining);
      if (sec !== lastTickSecondRef.current) {
        lastTickSecondRef.current = sec;
        if (sec <= 5 && sec > 0) {
          sounds.playUrgentTick();
        }
      }

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        if (selectedAnswer === null) {
          setPhase('answered');
          setAnswerResult({
            isCorrect: false,
            scoreEarned: 0,
            correctIndex: -1,
            timeTakenMs: ROUND_TIME_LIMIT_MS,
          });
          sounds.playWrong();
        }
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, roundStartTime, selectedAnswer]);

  // Submit answer
  const handleAnswer = async (answerIndex: number) => {
    if (selectedAnswer !== null || phase !== 'playing') return;

    // Explicit user gesture: start/resume question audio if paused or blocked
    if (audioRef.current && !isMuted) {
      if (audioRef.current.paused) {
        audioRef.current.play().then(() => {
          setIsPlayingMusic(true);
          setAutoplayBlocked(false);
        }).catch((err) => {
          console.warn('Audio play on answer failed:', err);
        });
      }
    }

    // Synchronized reaction time:
    // Calibrate Date.now() using serverClockOffsetRef to match the server roundStartTime precisely.
    // Clamped safely between 100ms and ROUND_TIME_LIMIT_MS.
    const syncedNow = Date.now() + serverClockOffsetRef.current;
    const syncedElapsedMs = roundStartTime > 0
      ? (syncedNow - roundStartTime)
      : (questionRenderTimeRef.current > 0 ? (performance.now() - questionRenderTimeRef.current) : 1000);
    const timeTakenMs = Math.min(ROUND_TIME_LIMIT_MS, Math.max(100, Math.round(syncedElapsedMs)));

    setSelectedAnswer(answerIndex);
    setPhase('answered');

    try {
      const res = await fetch('/api/game/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          playerId,
          answerIndex,
          timeTakenMs,
        }),
      });
      const data = await res.json();
      if (data.error) {
        console.error('Answer error:', data.error);
        return;
      }

      if (data.isCorrect) {
        sounds.playCorrect();
        setMyTotalScore((prev) => prev + data.scoreEarned);
      } else {
        sounds.playWrong();
      }

      setAnswerResult({
        isCorrect: data.isCorrect,
        scoreEarned: data.scoreEarned,
        correctIndex: data.correctIndex,
        timeTakenMs: data.timeTakenMs ?? timeTakenMs,
      });
    } catch (err) {
      console.error('Failed to submit answer:', err);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    sounds.setMuted(nextMuted);
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
      if (!nextMuted && (phase === 'playing' || phase === 'answered')) {
        audioRef.current.play().then(() => {
          setIsPlayingMusic(true);
          setAutoplayBlocked(false);
        }).catch(() => {});
      }
    }
    if (revealAudioRef.current) {
      revealAudioRef.current.muted = nextMuted;
    }
  };

  const handleEnableAudio = () => {
    sounds.unlock();
    sounds.setMuted(false);
    setIsMuted(false);
    setIsAudioUnlocked(true);
    isAudioUnlockedRef.current = true;

    if (audioRef.current) {
      audioRef.current.muted = false;
      audioRef.current.play().then(() => {
        setIsPlayingMusic(true);
        setAutoplayBlocked(false);
      }).catch((err) => {
        console.warn('Audio play failed:', err);
      });
    }
  };

  const handleTogglePlayMusic = () => {
    if (!audioRef.current) return;
    if (isPlayingMusic) {
      audioRef.current.pause();
      setIsPlayingMusic(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlayingMusic(true);
        setAutoplayBlocked(false);
      }).catch(() => {});
    }
  };

  const handleToggleRevealAudio = () => {
    if (!revealAudioRef.current) return;
    if (revealAudioPlaying) {
      revealAudioRef.current.pause();
      setRevealAudioPlaying(false);
    } else {
      revealAudioRef.current.currentTime = 0;
      revealAudioRef.current.muted = isMuted;
      revealAudioRef.current.play().then(() => {
        setRevealAudioPlaying(true);
      }).catch(() => {});
    }
  };

  const handleRerollAudioSection = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = audio.duration;
    if (!dur || isNaN(dur)) return;

    const newOffset = calculateRandomOffset(dur);
    roundStartOffsetRef.current = newOffset;
    try {
      audio.currentTime = newOffset;
      if (audio.paused && !isMuted) {
        audio.play().then(() => {
          setIsPlayingMusic(true);
          setAutoplayBlocked(false);
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Reroll seek failed:', e);
    }
  };

  // Synchronize and play question audio during playing/answered phases (with randomized section)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if ((phase === 'playing' || phase === 'answered') && question?.audioUrl) {
      const targetUrl = question.audioUrl;
      audio.muted = isMuted;

      const triggerPlayback = () => {
        const dur = audio.duration;
        if (dur && !isNaN(dur) && dur > 0) {
          // If this is a new round, calculate a fresh random section offset
          if (offsetRoundRef.current !== currentRound) {
            offsetRoundRef.current = currentRound;
            roundStartOffsetRef.current = calculateRandomOffset(dur);
          }

          const elapsed = roundStartTime > 0 ? Math.max(0, (Date.now() - roundStartTime) / 1000) : 0;
          const targetTime = Math.min(Math.max(0, dur - 1), roundStartOffsetRef.current + elapsed);

          if (Math.abs(audio.currentTime - targetTime) > 2) {
            try {
              audio.currentTime = targetTime;
            } catch (e) {
              console.warn('Could not seek audio to randomized section:', e);
            }
          }
        }

        if (!isMuted) {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                setIsPlayingMusic(true);
                setAutoplayBlocked(false);
              })
              .catch((err) => {
                console.warn('Player audio autoplay prevented:', err);
                setAutoplayBlocked(true);
                setIsPlayingMusic(false);
              });
          }
        }
      };

      if (currentAudioUrlRef.current !== targetUrl) {
        currentAudioUrlRef.current = targetUrl;
        audio.src = targetUrl;
        audio.load();

        const onReady = () => {
          audio.removeEventListener('canplay', onReady);
          audio.removeEventListener('loadedmetadata', onReady);
          triggerPlayback();
        };

        if (audio.readyState >= 2) {
          triggerPlayback();
        } else {
          audio.addEventListener('canplay', onReady, { once: true });
          audio.addEventListener('loadedmetadata', onReady, { once: true });
        }
      } else {
        // Same track, resume if paused and not muted
        if (audio.paused && !isMuted) {
          triggerPlayback();
        }
      }
    } else if (phase === 'round_end' || phase === 'finished' || phase === 'waiting') {
      offsetRoundRef.current = -1;
      roundStartOffsetRef.current = 0;
      currentAudioUrlRef.current = '';
      audio.pause();
      audio.currentTime = 0;
      setIsPlayingMusic(false);
    }
  }, [phase, question?.audioUrl, roundStartTime, isMuted, currentRound, calculateRandomOffset]);

  // Pause reveal audio when exiting round_end phase
  useEffect(() => {
    if (phase !== 'round_end' && revealAudioRef.current) {
      revealAudioRef.current.pause();
      revealAudioRef.current.currentTime = 0;
      setRevealAudioPlaying(false);
    }
  }, [phase]);

  const handleDirectJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputNickname.trim() || !roomCode) return;
    setJoinLoading(true);
    setJoinError('');
    unlockAudio();

    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          nickname: inputNickname.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setJoinError(data.error || 'Failed to join room');
        return;
      }

      sessionStorage.setItem('playerId', data.playerId);
      sessionStorage.setItem('nickname', data.nickname);
      sessionStorage.setItem('roomId', data.roomId);
      sessionStorage.setItem('roomCode', roomCode);

      setPlayerId(data.playerId);
      setNickname(data.nickname);
      setIsJoined(true);
      setPhase('waiting');
      sounds.playStart();
    } catch (err) {
      setJoinError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleExitRoom = () => {
    sessionStorage.removeItem('playerId');
    sessionStorage.removeItem('nickname');
    sessionStorage.removeItem('roomId');
    sessionStorage.removeItem('roomCode');
    window.location.href = '/';
  };

  // ─── Render ──────────────────────────────────────────────────────

  // 1. Loading room check
  if (checkingRoom) {
    return (
      <main className="flex-1 flex items-center justify-center p-4 min-h-screen">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin" />
          <p className="text-[var(--text-muted)] text-sm">กำลังเชื่อมต่อห้อง {roomCode}...</p>
        </div>
      </main>
    );
  }

  // 2. Room not found or connection error
  if (roomError) {
    return (
      <main className="flex-1 flex items-center justify-center p-4 min-h-screen">
        <div className="glass-card-static p-8 text-center max-w-sm w-full space-y-5 animate-fade-in-up">
          <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-3xl">
            ❌
          </div>
          <h2 className="text-2xl font-bold text-rose-400">ไม่พบห้องนี้</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            รหัสห้อง <span className="font-mono font-bold text-white">{roomCode}</span> ไม่มีอยู่ หรือห้องอาจถูกปิดไปแล้ว
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="btn-secondary w-full"
          >
            กลับหน้าหลัก
          </button>
        </div>
      </main>
    );
  }

  // 3. Prompt player to join with nickname if entered via link
  if (!isJoined) {
    return (
      <main className="flex-1 flex items-center justify-center p-4 min-h-screen">
        <div className="glass-card-static p-8 max-w-sm w-full space-y-6 animate-fade-in-up">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-500 mb-2 shadow-lg animate-float">
              <span className="text-3xl">🏍️</span>
            </div>
            <h1 className="text-2xl font-black brand-gradient" style={{ fontFamily: 'var(--font-display)' }}>
              เข้าร่วมเล่นเกม
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              ห้อง: <span className="font-mono font-black text-[var(--accent-cyan)] tracking-wider">{roomCode}</span>
            </p>
          </div>

          {roomStatus !== 'lobby' ? (
            <div className="text-center space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
                เกมในห้องนี้เริ่มไปแล้ว หรือจบลงแล้ว ไม่สามารถเข้าร่วมได้ในขณะนี้
              </div>
              <button
                onClick={() => window.location.href = '/'}
                className="btn-secondary w-full"
              >
                กลับหน้าหลัก
              </button>
            </div>
          ) : (
            <form onSubmit={handleDirectJoin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  ชื่อเล่นของคุณ (Nickname)
                </label>
                <input
                  type="text"
                  value={inputNickname}
                  onChange={(e) => setInputNickname(e.target.value)}
                  placeholder="เช่น Decade, Build, Geats"
                  maxLength={20}
                  className="input-field text-center text-lg font-bold"
                  autoFocus
                />
              </div>

              {joinError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center animate-fade-in">
                  {joinError}
                </div>
              )}

              <button
                type="submit"
                disabled={joinLoading || !inputNickname.trim()}
                className="btn-primary w-full text-base py-3"
                id="direct-join-btn"
              >
                {joinLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    กำลังเข้าร่วม...
                  </span>
                ) : (
                  'เข้าร่วมห้อง 🚀'
                )}
              </button>

              <button
                type="button"
                onClick={() => window.location.href = '/'}
                className="btn-secondary w-full text-sm py-2 opacity-70 hover:opacity-100"
              >
                กลับหน้าหลัก
              </button>
            </form>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-h-screen max-w-lg md:max-w-2xl mx-auto w-full">
      {/* Permanent Question Audio Element (stays mounted across all phases) */}
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onPlay={() => {
          setIsPlayingMusic(true);
          setAutoplayBlocked(false);
        }}
        onPause={() => setIsPlayingMusic(false)}
        onEnded={() => setIsPlayingMusic(false)}
        onError={(e) => {
          console.warn('Audio playback error:', e);
          setIsPlayingMusic(false);
        }}
      />

      {/* Compact Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md px-4 py-2 flex items-center justify-between bg-[rgba(0,0,0,0.3)] border-b border-white/5" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-md"
            style={{ background: 'linear-gradient(135deg, #a855f7, #06b6d4)' }}
          >
            {nickname.charAt(0).toUpperCase() || '?'}
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">{nickname || 'Player'}</p>
            <p className="text-[10px] text-amber-400 font-bold leading-tight">
              {myTotalScore.toLocaleString()} pts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMute}
            className="p-1 rounded text-xs opacity-60 hover:opacity-100 transition-opacity"
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <span className="text-xs font-bold text-purple-400">{roomCode}</span>
        </div>
      </header>

      {/* Persistent Autoplay Blocked Banner (visible during playing and answered) */}
      {autoplayBlocked && (phase === 'playing' || phase === 'answered') && (
        <button
          onClick={handleEnableAudio}
          className="mx-3 my-2 p-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg animate-pulse active:scale-95 z-30"
          id="enable-audio-banner"
        >
          <span>🔊 แตะที่นี่เพื่อเปิดเสียงเพลง (Tap to play song)</span>
        </button>
      )}

      {/* Persistent Compact Player Audio Bar (visible during playing and answered) */}
      {(phase === 'playing' || phase === 'answered') && question && (
        <div className="mx-3 mb-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm">🎵</span>
            <span className="text-xs font-semibold text-purple-200 truncate">
              {isPlayingMusic ? 'กำลังเล่นเพลง (สุ่มท่อน)...' : isMuted ? 'ปิดเสียงเพลงอยู่' : 'เพลงหยุดชั่วคราว'}
            </span>
            {isPlayingMusic && (
              <span className="flex items-center gap-0.5 shrink-0">
                <span className="w-1 h-2.5 bg-cyan-400 animate-pulse rounded-full" />
                <span className="w-1 h-4 bg-purple-400 animate-pulse rounded-full" style={{ animationDelay: '0.2s' }} />
                <span className="w-1 h-2 bg-pink-400 animate-pulse rounded-full" style={{ animationDelay: '0.4s' }} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleRerollAudioSection}
              className="px-2 py-0.5 rounded-md bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 text-[11px] font-bold transition-all active:scale-95 flex items-center gap-1"
              title="สุ่มท่อนใหม่"
              id="player-reroll-btn"
            >
              <span>🎲</span>
              <span className="hidden min-[360px]:inline">สุ่มท่อน</span>
            </button>
            <button
              onClick={handleTogglePlayMusic}
              className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition-all active:scale-95"
            >
              {isPlayingMusic ? '⏸️ หยุด' : '▶️ เล่น'}
            </button>
            <button
              onClick={handleToggleMute}
              className="px-1.5 py-0.5 rounded-md text-xs hover:bg-white/10 transition-all"
              title={isMuted ? 'เปิดเสียง' : 'ปิดเสียง'}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col">
        {/* ─── Waiting ─── */}
        {phase === 'waiting' && (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center animate-fade-in-up space-y-4 max-w-sm w-full">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-purple-600/20 to-cyan-500/20 border border-purple-500/20 flex items-center justify-center text-4xl animate-pulse">
                🏍️
              </div>
              <h2 className="text-2xl font-bold brand-gradient" style={{ fontFamily: 'var(--font-display)' }}>
                พร้อมแล้ว!
              </h2>
              <p className="text-lg font-semibold">{nickname}</p>
              <p className="text-sm text-[var(--text-muted)] max-w-xs mx-auto">
                ดูหน้าจอหลัก — เกมจะเริ่มเร็วๆ นี้!
              </p>

              {/* Sound check & mobile audio unlock button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    unlockAudio();
                    sounds.playStart();
                    setIsAudioUnlocked(true);
                    isAudioUnlockedRef.current = true;
                  }}
                  className={`w-full py-3 px-4 rounded-xl border text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg active:scale-95 ${
                    isAudioUnlocked
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 shadow-emerald-500/10'
                      : 'bg-gradient-to-r from-purple-600/30 to-cyan-600/30 border-purple-500/40 text-purple-200 hover:border-purple-400 hover:bg-purple-600/40'
                  }`}
                  id="sound-check-btn"
                >
                  <span className="text-base">{isAudioUnlocked ? '✅' : '🔊'}</span>
                  <span>{isAudioUnlocked ? 'ระบบเสียงพร้อมแล้ว (Sound Ready)' : 'แตะเพื่อเปิดเสียง / ทดสอบระบบเสียง'}</span>
                </button>
                <p className="text-[11px] text-white/50 mt-1.5">
                  {isAudioUnlocked
                    ? '🎵 เพลงคำถามจะเล่นอัตโนมัติเมื่อเริ่มเกม'
                    : '💡 แนะนำให้แตะเปิดเสียง เพื่อให้เบราว์เซอร์มือถืออนุญาตให้เล่นเพลง'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── Playing: Kahoot-style Answer Buttons ─── */}
        {phase === 'playing' && question && (
          <div className="flex-1 flex flex-col animate-fade-in">
            {/* Mini status bar */}
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-xs font-bold text-white/50">
                ข้อ {currentRound}/{totalRounds}
              </span>
              <span className={`text-lg font-black ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                {Math.ceil(timeLeft)}
              </span>
            </div>

            {/* Kahoot-style 2x2 Grid Answer Buttons with Rider Images */}
            <div className="flex-1 grid grid-cols-2 gap-2 sm:gap-3 p-2 sm:p-3">
              {question.options.map((option, idx) => {
                const kahoot = KAHOOT_OPTIONS[idx];
                const riderImg = getRiderImage(option);
                const isSelected = selectedAnswer === idx;

                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(idx)}
                    disabled={selectedAnswer !== null}
                    className={`
                      group relative rounded-2xl overflow-hidden
                      border-2 transition-all duration-200 shadow-xl
                      flex flex-col text-left
                      ${selectedAnswer === null
                        ? 'hover:scale-[1.02] active:scale-95 cursor-pointer'
                        : isSelected
                          ? 'ring-4 ring-white scale-[1.02]'
                          : 'opacity-35 grayscale-[40%] cursor-not-allowed'
                      }
                    `}
                    style={{
                      borderColor: kahoot.color,
                      backgroundColor: 'rgba(15, 12, 35, 0.95)',
                      minHeight: 'clamp(120px, 32dvh, 260px)',
                    }}
                    id={`answer-option-${idx}`}
                  >
                    {/* Top Bar with Kahoot Symbol & Label */}
                    <div
                      className="px-2.5 py-1 flex items-center justify-between text-white font-bold text-xs shadow-md"
                      style={{ backgroundColor: kahoot.color }}
                    >
                      <span className="text-lg leading-none">{kahoot.shape}</span>
                      <span className="text-[11px] uppercase tracking-wider font-black">{kahoot.label}</span>
                    </div>

                    {/* Rider Image Area */}
                    <div className="relative flex-1 w-full bg-zinc-950/80 overflow-hidden flex items-center justify-center min-h-[95px]">
                      {riderImg ? (
                        <img
                          src={riderImg}
                          alt={option}
                          className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                          loading="eager"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl">
                          🏍️
                        </div>
                      )}

                      {/* Bottom Gradient for text readability */}
                      <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black via-black/85 to-transparent pointer-events-none" />

                      {/* Rider Name Label */}
                      <div className="absolute bottom-1 inset-x-1.5 pointer-events-none">
                        <p className="text-white font-black text-xs sm:text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,1)] truncate leading-tight">
                          {option}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Answered: Waiting for reveal ─── */}
        {phase === 'answered' && (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center animate-fade-in-up space-y-4 w-full max-w-sm">
              {answerResult ? (
                <>
                  {/* Result icon */}
                  <div className={`w-24 h-24 sm:w-32 sm:h-32 mx-auto rounded-full flex items-center justify-center text-5xl sm:text-6xl animate-score-pop ${
                    answerResult.isCorrect
                      ? 'bg-emerald-500/20 border-4 border-emerald-400'
                      : 'bg-rose-500/20 border-4 border-rose-400'
                  }`}>
                    {answerResult.isCorrect ? '✅' : '❌'}
                  </div>

                  <h2
                    className={`text-3xl font-black ${
                      answerResult.isCorrect ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {answerResult.isCorrect ? 'ถูกต้อง!' : 'ผิด!'}
                  </h2>

                  {answerResult.isCorrect ? (
                    <div className="space-y-1">
                      <p className="text-5xl font-black text-amber-400 animate-score-pop" style={{ fontFamily: 'var(--font-display)' }}>
                        +{answerResult.scoreEarned}
                      </p>
                      <p className="text-sm text-white/60">คะแนนที่ได้</p>
                    </div>
                  ) : (
                    <p className="text-base text-white/50">
                      เพลงถัดไปได้แน่นอน! 💪
                    </p>
                  )}

                  {/* Response Time Badge */}
                  {answerResult.timeTakenMs !== undefined && (
                    <div className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 font-mono text-xs sm:text-sm font-bold shadow-md animate-fade-in">
                      <span>⏱️ เวลาในการกด:</span>
                      <span className="text-white text-lg font-black">
                        {(answerResult.timeTakenMs / 1000).toFixed(2)}
                      </span>
                      <span>วินาที</span>
                    </div>
                  )}

                  {/* Selected Choice Preview */}
                  {selectedAnswer !== null && question && (
                    <div className="flex items-center justify-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10 max-w-xs mx-auto">
                      {getRiderImage(question.options[selectedAnswer]) && (
                        <img
                          src={getRiderImage(question.options[selectedAnswer])}
                          alt="selected"
                          className="w-12 h-12 rounded-lg object-cover border border-white/20 shadow-md shrink-0"
                        />
                      )}
                      <div className="text-left min-w-0">
                        <p className="text-[10px] text-white/50 uppercase font-semibold">ตัวเลือกของคุณ</p>
                        <p className="text-sm font-bold text-white truncate">{question.options[selectedAnswer]}</p>
                      </div>
                    </div>
                  )}

                  {/* Score bar */}
                  <div className="glass-card-static p-4 mt-4">
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">คะแนนรวม</p>
                    <p className="text-3xl font-black text-amber-400" style={{ fontFamily: 'var(--font-display)' }}>
                      {myTotalScore.toLocaleString()}
                    </p>
                  </div>

                  {/* Audio status reminder in answered phase */}
                  {isPlayingMusic && (
                    <div className="flex items-center justify-center gap-2 text-xs text-purple-300 font-semibold py-1">
                      <span>🎵 เพลงกำลังเล่นคลออยู่...</span>
                      <span className="flex items-center gap-0.5 shrink-0">
                        <span className="w-1 h-2 bg-cyan-400 animate-pulse rounded-full" />
                        <span className="w-1 h-3 bg-purple-400 animate-pulse rounded-full" style={{ animationDelay: '0.2s' }} />
                        <span className="w-1 h-1.5 bg-pink-400 animate-pulse rounded-full" style={{ animationDelay: '0.4s' }} />
                      </span>
                    </div>
                  )}

                  <p className="text-white/30 text-xs animate-pulse mt-2">
                    ⏳ รอ Host เฉลยคำตอบ...
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 mx-auto rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin" />
                  <p className="text-white/60">กำลังส่งคำตอบ...</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── Round End: Kahoot Auto Flow ─── */}
        {phase === 'round_end' && roundEndInfo && (
          <div className="flex-1 space-y-4 p-3 sm:p-4 animate-fade-in-up overflow-y-auto">
            {/* Auto Countdown Progress Bar */}
            <div className="glass-card-static p-3 text-center border border-purple-500/30">
              <p className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-1">
                {roundEndStage === 'reveal'
                  ? `📊 กำลังจะแสดงคะแนนอันดับใน ${Math.ceil(stageTimerLeft)}s...`
                  : currentRound >= totalRounds
                  ? `👑 เตรียมสรุปผลผู้ชนะใน ${Math.ceil(stageTimerLeft)}s...`
                  : `⚡ ข้อต่อไปจะเริ่มใน ${Math.ceil(stageTimerLeft)}s...`}
              </p>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400 transition-all duration-100 ease-linear"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        (((roundEndStage === 'reveal' ? 5 : 6) - stageTimerLeft) /
                          (roundEndStage === 'reveal' ? 5 : 6)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* STAGE 1: REVEAL */}
            {roundEndStage === 'reveal' && (() => {
              const myResult = roundEndInfo.roundResults.find((r) => r.player_id === playerId);
              const isCorrect = myResult ? myResult.is_correct : answerResult?.isCorrect ?? false;
              const scoreEarned = myResult ? myResult.score_earned : answerResult?.scoreEarned ?? 0;
              const timeTaken = myResult?.time_taken_ms ?? answerResult?.timeTakenMs;

              return (
                <div className="space-y-4 animate-fade-in">
                  {/* Feedback Card */}
                  <div
                    className={`glass-card-static p-6 text-center space-y-3 border-2 ${
                      isCorrect
                        ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_30px_rgba(52,211,153,0.2)]'
                        : 'border-rose-400 bg-rose-500/10'
                    }`}
                  >
                    <div className="text-5xl animate-score-pop">
                      {isCorrect ? '✅' : '❌'}
                    </div>
                    <h2
                      className={`text-2xl font-black ${
                        isCorrect ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {isCorrect ? 'ถูกต้อง!' : 'ตอบไม่ถูกต้อง!'}
                    </h2>

                    {isCorrect ? (
                      <div className="space-y-2">
                        <p className="text-3xl font-black text-amber-400 animate-score-pop" style={{ fontFamily: 'var(--font-display)' }}>
                          +{scoreEarned} pts
                        </p>
                        {timeTaken !== undefined && (
                          <div>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono text-xs font-bold shadow-sm">
                              <span>⏱️ เวลาในการกด:</span>
                              <span className="text-white text-sm font-black">{(timeTaken / 1000).toFixed(2)}</span>
                              <span>วินาที</span>
                            </span>
                          </div>
                        )}
                        <p className="text-xs text-white/50">คะแนนสะสม: {myTotalScore.toLocaleString()} pts</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {timeTaken !== undefined && (
                          <div>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white/70 font-mono text-xs font-bold">
                              <span>⏱️ เวลาในการกด:</span>
                              <span className="text-white text-sm font-black">{(timeTaken / 1000).toFixed(2)}</span>
                              <span>วินาที</span>
                            </span>
                          </div>
                        )}
                        <p className="text-xs text-white/50">
                          เพลงต่อไปสู้ใหม่ได้! 💪
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Correct Track Reveal Card */}
                  <div className="glass-card-static p-5 text-center space-y-2">
                    <p className="text-white/40 text-[10px] uppercase tracking-widest">คำตอบที่ถูกต้อง</p>

                    <div className="flex justify-center my-2">
                      <AlbumArt
                        songTitle={roundEndInfo.songTitle}
                        series={roundEndInfo.series}
                        artist={roundEndInfo.artist}
                        albumTitle={roundEndInfo.albumTitle}
                        era={roundEndInfo.era}
                        themeColor={roundEndInfo.themeColor}
                        coverUrl={roundEndInfo.coverUrl}
                        size="md"
                        showVinyl={true}
                        isSpinning={true}
                      />
                    </div>

                    <h3 className="text-xl font-black brand-gradient" style={{ fontFamily: 'var(--font-display)' }}>
                      {roundEndInfo.songTitle}
                    </h3>
                    <p className="text-base font-bold text-cyan-400">{roundEndInfo.series}</p>
                    <p className="text-xs text-white/40">by {roundEndInfo.artist}</p>

                    {/* Reveal Track Audio Player */}
                    {roundEndInfo.audioUrl && (
                      <div className="pt-2">
                        <audio
                          ref={revealAudioRef}
                          src={roundEndInfo.audioUrl}
                          preload="auto"
                          playsInline
                          onPlay={() => setRevealAudioPlaying(true)}
                          onPause={() => setRevealAudioPlaying(false)}
                          onEnded={() => setRevealAudioPlaying(false)}
                        />
                        <button
                          onClick={handleToggleRevealAudio}
                          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 text-xs font-bold transition-all active:scale-95 shadow-sm"
                        >
                          <span>{revealAudioPlaying ? '⏸️ หยุดฟัง' : '🎧 ฟังเพลงเฉลย'}</span>
                          {revealAudioPlaying && (
                            <span className="flex items-center gap-0.5">
                              <span className="w-1 h-2.5 bg-cyan-400 animate-pulse rounded-full" />
                              <span className="w-1 h-3.5 bg-purple-400 animate-pulse rounded-full" style={{ animationDelay: '0.15s' }} />
                              <span className="w-1 h-2 bg-pink-400 animate-pulse rounded-full" style={{ animationDelay: '0.3s' }} />
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* STAGE 2: LEADERBOARD */}
            {roundEndStage === 'leaderboard' && (() => {
              const myRank = roundEndInfo.leaderboard.findIndex((e) => e.player_id === playerId) + 1;
              const myEntry = roundEndInfo.leaderboard.find((e) => e.player_id === playerId);
              const myResult = roundEndInfo.roundResults.find((r) => r.player_id === playerId);

              return (
                <div className="space-y-4 animate-fade-in">
                  {/* My Standings Hero Card */}
                  <div className="glass-card-static p-6 text-center space-y-2 border border-purple-500/40 bg-gradient-to-b from-purple-900/30 to-transparent">
                    <p className="text-xs text-purple-300 uppercase tracking-widest font-semibold">
                      อันดับของคุณ
                    </p>
                    <div className="text-3xl sm:text-4xl font-black brand-gradient flex items-center justify-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                      <span>{myRank === 1 ? '👑' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🏍️'}</span>
                      <span>อันดับที่ #{myRank > 0 ? myRank : '-'}</span>
                    </div>
                    <p className="text-3xl font-black text-amber-400" style={{ fontFamily: 'var(--font-display)' }}>
                      {(myEntry?.score ?? myTotalScore).toLocaleString()} pts
                    </p>
                    <div className="flex items-center justify-center gap-2 flex-wrap text-xs pt-1">
                      {myResult?.is_correct && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                          ✓ ได้คะแนนรอบนี้ +{myResult.score_earned}
                        </span>
                      )}
                      {(myResult?.time_taken_ms ?? answerResult?.timeTakenMs) !== undefined && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono font-bold">
                          ⏱️ {(((myResult?.time_taken_ms ?? answerResult?.timeTakenMs) || 0) / 1000).toFixed(2)}s
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Leaderboard Table */}
                  <div className="glass-card-static p-4 space-y-2">
                    <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                      🏆 ตารางคะแนนรวม
                    </h4>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {roundEndInfo.leaderboard.map((entry, idx) => (
                        <div
                          key={entry.player_id}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border ${
                            entry.player_id === playerId
                              ? 'bg-purple-600/20 border-purple-500/50 shadow-sm'
                              : 'bg-white/5 border-transparent'
                          }`}
                        >
                          <span className="font-bold text-sm w-7 text-center">
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                          </span>
                          <span className="font-semibold flex-1 text-sm truncate text-white">
                            {entry.nickname} {entry.player_id === playerId && '(คุณ)'}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {entry.last_time_taken_ms !== undefined && (
                              <span className="hidden min-[380px]:inline text-[11px] font-mono font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-700/50 px-2 py-0.5 rounded">
                                ⏱️ {(entry.last_time_taken_ms / 1000).toFixed(2)}s
                              </span>
                            )}
                            <span className="font-bold text-sm text-amber-400">
                              {entry.score.toLocaleString()} pts
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ─── Finished ─── */}
        {phase === 'finished' && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 animate-fade-in-up space-y-5">
            <div className="text-6xl animate-float">🏆</div>
            <div className="text-center">
              <h2 className="text-3xl font-black brand-gradient mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                จบเกม!
              </h2>
            </div>

            <div className="glass-card-static p-6 w-full text-center space-y-1">
              <p className="text-xs text-white/40 uppercase tracking-wider">คะแนนสุดท้ายของคุณ</p>
              <p className="text-4xl font-black text-amber-400 animate-score-pop" style={{ fontFamily: 'var(--font-display)' }}>
                {myTotalScore.toLocaleString()} pts
              </p>
              {/* Find my rank */}
              {(() => {
                const myRank = finalLeaderboard.findIndex(e => e.player_id === playerId) + 1;
                return myRank > 0 ? (
                  <p className="text-lg font-bold text-purple-300">
                    อันดับที่ {myRank} จาก {finalLeaderboard.length} คน
                  </p>
                ) : null;
              })()}
            </div>

            {/* Final Leaderboard */}
            <div className="glass-card-static p-4 w-full space-y-1.5 max-h-60 overflow-y-auto">
              <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
                ตารางคะแนน
              </h4>
              {finalLeaderboard.map((entry, idx) => (
                <div
                  key={entry.player_id}
                  className={`flex items-center gap-2 p-2.5 rounded-lg ${
                    entry.player_id === playerId ? 'bg-purple-600/20 border border-purple-500/40' : 'bg-white/5'
                  }`}
                >
                  <span className="font-bold text-sm w-6 text-center">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                  </span>
                  <span className="font-semibold flex-1 text-sm truncate">
                    {entry.nickname} {entry.player_id === playerId && '(คุณ)'}
                  </span>
                  <span className="font-bold text-sm text-amber-400">
                    {entry.score.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            {/* Player Action Buttons: Exit or Wait */}
            <div className="w-full space-y-3 pt-1">
              <button
                onClick={handleExitRoom}
                className="w-full py-3.5 sm:py-4 px-4 sm:px-6 rounded-2xl bg-white/10 hover:bg-rose-500/20 border-2 border-white/20 hover:border-rose-400 text-white font-bold text-base sm:text-lg transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 shadow-xl shadow-black/40"
                id="player-exit-btn"
              >
                <span>🚪</span>
                <span>ออกจากห้อง (กลับหน้าแรก)</span>
              </button>

              <div className="p-3.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold text-center flex items-center justify-center gap-2 animate-pulse shadow-sm">
                <span className="text-base">⏳</span>
                <span>หากต้องการเล่นต่อ สามารถรอ Host เริ่มเกมรอบใหม่ในห้องนี้ได้</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
