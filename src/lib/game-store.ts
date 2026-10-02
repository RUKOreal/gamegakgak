/**
 * In-memory game store for demo/development mode.
 * Used when Supabase is not configured (no env vars).
 *
 * NOTE: This works great for local dev and single-instance deployment.
 * For production with multiple serverless instances, use Supabase.
 */

import { v4 as uuidv4 } from 'uuid';

import { LeaderboardEntry, RoundResult } from './types';

export interface RoundEndInfoData {
  correctIndex: number;
  songTitle: string;
  series: string;
  artist: string;
  albumTitle?: string;
  era?: string;
  themeColor?: string;
  coverUrl?: string;
  youtubeId?: string;
  leaderboard: LeaderboardEntry[];
  roundResults: RoundResult[];
  isGameOver: boolean;
}

export interface MemRoom {
  id: string;
  code: string;
  status: 'lobby' | 'playing' | 'round_end' | 'finished';
  current_round: number;
  total_rounds: number;
  current_question_index: number;
  round_start_time: number | null;
  question_ids: number[];
  round_end_data?: RoundEndInfoData | null;
  created_at: string;
}

export interface MemPlayer {
  id: string;
  room_id: string;
  player_id: string;
  nickname: string;
  score: number;
  is_host: boolean;
  created_at: string;
}

export interface MemAnswer {
  id: string;
  room_id: string;
  player_id: string;
  round: number;
  answer_index: number;
  is_correct: boolean;
  time_taken_ms: number;
  score_earned: number;
  created_at: string;
}

// ─── In-Memory Storage ──────────────────────────────────────────────

const rooms = new Map<string, MemRoom>();
const players = new Map<string, MemPlayer[]>(); // room_id -> players
const answers = new Map<string, MemAnswer[]>(); // room_id -> answers

// ─── Room Operations ────────────────────────────────────────────────

export function createRoom(code: string): MemRoom {
  const room: MemRoom = {
    id: uuidv4(),
    code,
    status: 'lobby',
    current_round: 0,
    total_rounds: 10,
    current_question_index: -1,
    round_start_time: null,
    question_ids: [],
    round_end_data: null,
    created_at: new Date().toISOString(),
  };
  rooms.set(room.id, room);
  players.set(room.id, []);
  answers.set(room.id, []);
  return room;
}

export function getRoomByCode(code: string): MemRoom | undefined {
  for (const room of rooms.values()) {
    if (room.code === code.toUpperCase()) return room;
  }
  return undefined;
}

export function getRoomById(id: string): MemRoom | undefined {
  return rooms.get(id);
}

export function updateRoom(id: string, updates: Partial<MemRoom>): MemRoom | undefined {
  const room = rooms.get(id);
  if (!room) return undefined;
  Object.assign(room, updates);
  return room;
}

// ─── Player Operations ──────────────────────────────────────────────

export function addPlayer(
  roomId: string,
  playerId: string,
  nickname: string,
  isHost: boolean
): MemPlayer {
  const player: MemPlayer = {
    id: uuidv4(),
    room_id: roomId,
    player_id: playerId,
    nickname,
    score: 0,
    is_host: isHost,
    created_at: new Date().toISOString(),
  };
  const roomPlayers = players.get(roomId) || [];
  roomPlayers.push(player);
  players.set(roomId, roomPlayers);
  return player;
}

export function getPlayers(roomId: string): MemPlayer[] {
  return players.get(roomId) || [];
}

export function getPlayerByPlayerId(
  roomId: string,
  playerId: string
): MemPlayer | undefined {
  return getPlayers(roomId).find((p) => p.player_id === playerId);
}

export function getPlayerByNickname(
  roomId: string,
  nickname: string
): MemPlayer | undefined {
  return getPlayers(roomId).find((p) => p.nickname === nickname);
}

export function updatePlayerScore(
  roomId: string,
  playerId: string,
  scoreToAdd: number
): void {
  const player = getPlayerByPlayerId(roomId, playerId);
  if (player) {
    player.score += scoreToAdd;
  }
}

export function resetAllPlayerScores(roomId: string): void {
  const roomPlayers = getPlayers(roomId);
  roomPlayers.forEach((p) => (p.score = 0));
}

// ─── Answer Operations ──────────────────────────────────────────────

export function addAnswer(
  roomId: string,
  playerId: string,
  round: number,
  answerIndex: number,
  isCorrect: boolean,
  timeTakenMs: number,
  scoreEarned: number
): MemAnswer {
  const answer: MemAnswer = {
    id: uuidv4(),
    room_id: roomId,
    player_id: playerId,
    round,
    answer_index: answerIndex,
    is_correct: isCorrect,
    time_taken_ms: timeTakenMs,
    score_earned: scoreEarned,
    created_at: new Date().toISOString(),
  };
  const roomAnswers = answers.get(roomId) || [];
  roomAnswers.push(answer);
  answers.set(roomId, roomAnswers);
  return answer;
}

export function getAnswer(
  roomId: string,
  playerId: string,
  round: number
): MemAnswer | undefined {
  return (answers.get(roomId) || []).find(
    (a) => a.player_id === playerId && a.round === round
  );
}

export function getRoundAnswers(roomId: string, round: number): MemAnswer[] {
  return (answers.get(roomId) || [])
    .filter((a) => a.round === round)
    .sort((a, b) => a.time_taken_ms - b.time_taken_ms);
}

export function clearRoomAnswers(roomId: string): void {
  answers.set(roomId, []);
}

// ─── Utility ────────────────────────────────────────────────────────

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return !!(
    url &&
    url !== '' &&
    url !== 'https://YOUR_PROJECT_ID.supabase.co' &&
    key &&
    key !== '' &&
    key !== 'your_service_role_key_here' &&
    key !== 'your_anon_key_here'
  );
}
