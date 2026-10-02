// ─── Core Types ──────────────────────────────────────────────────────────────

export type RoomStatus = 'lobby' | 'playing' | 'round_end' | 'finished';

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  current_round: number;
  total_rounds: number;
  current_question_index: number;
  round_start_time: number | null;
  created_at: string;
}

export interface Player {
  id: string;
  room_id: string;
  player_id: string;
  nickname: string;
  score: number;
  is_host: boolean;
  created_at: string;
}

export interface Answer {
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

// ─── Question / Song Data ────────────────────────────────────────────────────

export interface Question {
  id: number;
  songTitle: string;
  series: string;
  artist: string;
  albumTitle?: string;
  era?: 'Showa' | 'Heisei' | 'Reiwa';
  themeColor?: string;
  coverUrl?: string;
  // Placeholder audio/video - can be YouTube embed URL or local audio path
  audioUrl: string;
  youtubeId?: string;
  options: string[];
  correctIndex: number;
}

// ─── Game Events (Supabase Broadcast) ────────────────────────────────────────

export interface GameStartedEvent {
  type: 'game_started';
  totalRounds: number;
}

export interface NewQuestionEvent {
  type: 'new_question';
  round: number;
  question: {
    id: number;
    options: string[];
    audioUrl: string;
    youtubeId?: string;
    coverUrl?: string;
    themeColor?: string;
    era?: string;
  };
  startTime: number;
}

export interface PlayerAnsweredEvent {
  type: 'player_answered';
  playerId: string;
  nickname: string;
  round: number;
}

export interface RoundEndEvent {
  type: 'round_end';
  round: number;
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
}

export interface GameFinishedEvent {
  type: 'game_finished';
  finalLeaderboard: LeaderboardEntry[];
}

export interface PlayerJoinedEvent {
  type: 'player_joined';
  player: Pick<Player, 'player_id' | 'nickname'>;
}

export type GameEvent =
  | GameStartedEvent
  | NewQuestionEvent
  | PlayerAnsweredEvent
  | RoundEndEvent
  | GameFinishedEvent
  | PlayerJoinedEvent;

// ─── UI Types ────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  player_id: string;
  nickname: string;
  score: number;
  rank: number;
  last_time_taken_ms?: number;
  last_score_earned?: number;
}

export interface RoundResult {
  player_id: string;
  nickname: string;
  answer_index: number;
  is_correct: boolean;
  time_taken_ms: number;
  score_earned: number;
}
