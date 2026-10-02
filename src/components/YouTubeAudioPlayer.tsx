'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * YouTube IFrame Player API typings (minimal)
 */
interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  destroy: () => void;
  getPlayerState: () => number;
  setVolume: (vol: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        config: {
          videoId: string;
          height?: string;
          width?: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: YTPlayerEvent) => void;
            onStateChange?: (event: YTPlayerEvent) => void;
            onError?: (event: YTPlayerEvent) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubeAudioPlayerProps {
  youtubeId: string;
  /** Auto-play when ready (may be blocked by browsers) */
  autoPlay?: boolean;
  /** Start time in seconds */
  startTime?: number;
  /** End time in seconds (0 = no limit) */
  endTime?: number;
  /** Volume 0-100 */
  volume?: number;
  /** Show the audio visualizer UI */
  showVisualizer?: boolean;
  /** Called when player actually starts playing */
  onPlaying?: () => void;
  /** Called when playback ends */
  onEnded?: () => void;
}

// Ensure the YT API script is loaded only once
let ytApiLoaded = false;
let ytApiReady = false;
const ytReadyCallbacks: (() => void)[] = [];

function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (ytApiReady && window.YT) {
      resolve();
      return;
    }

    ytReadyCallbacks.push(resolve);

    if (!ytApiLoaded) {
      ytApiLoaded = true;

      const existingCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        ytApiReady = true;
        if (existingCallback) existingCallback();
        ytReadyCallbacks.forEach((cb) => cb());
        ytReadyCallbacks.length = 0;
      };

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export function YouTubeAudioPlayer({
  youtubeId,
  autoPlay = true,
  startTime = 0,
  endTime = 30,
  volume = 80,
  showVisualizer = true,
  onPlaying,
  onEnded,
}: YouTubeAudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsManualPlay, setNeedsManualPlay] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const instanceIdRef = useRef(`yt-player-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.stopVideo();
        playerRef.current.destroy();
      } catch {
        // Player may already be destroyed
      }
      playerRef.current = null;
    }
  }, []);

  const handleManualPlay = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.playVideo();
      setNeedsManualPlay(false);
    }
  }, []);

  useEffect(() => {
    if (!youtubeId) return;

    let cancelled = false;

    const init = async () => {
      await loadYouTubeAPI();
      if (cancelled || !window.YT) return;

      // Ensure container element exists
      const container = containerRef.current;
      if (!container) return;

      // Create a child div for the player (YT.Player replaces the element)
      const playerEl = document.createElement('div');
      playerEl.id = instanceIdRef.current;
      container.innerHTML = '';
      container.appendChild(playerEl);

      destroyPlayer();

      const playerVars: Record<string, number | string> = {
        autoplay: autoPlay ? 1 : 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        showinfo: 0,
        start: startTime,
      };
      if (endTime > 0) {
        playerVars.end = endTime;
      }

      playerRef.current = new window.YT.Player(playerEl, {
        videoId: youtubeId,
        height: '1',
        width: '1',
        playerVars,
        events: {
          onReady: (event: YTPlayerEvent) => {
            if (cancelled) return;
            event.target.setVolume(volume);
            setIsLoading(false);
            if (autoPlay) {
              event.target.playVideo();
            }
          },
          onStateChange: (event: YTPlayerEvent) => {
            if (cancelled) return;
            const state = event.data;

            if (state === window.YT!.PlayerState.PLAYING) {
              setIsPlaying(true);
              setNeedsManualPlay(false);
              onPlaying?.();
            } else if (state === window.YT!.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (state === window.YT!.PlayerState.ENDED) {
              setIsPlaying(false);
              onEnded?.();
            } else if (state === window.YT!.PlayerState.UNSTARTED && autoPlay) {
              // Autoplay was blocked by the browser
              setNeedsManualPlay(true);
              setIsLoading(false);
            }
          },
          onError: () => {
            if (cancelled) return;
            setIsLoading(false);
            setNeedsManualPlay(true);
          },
        },
      });
    };

    init();

    return () => {
      cancelled = true;
      destroyPlayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId]);

  // Update volume when prop changes
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setVolume(volume);
    }
  }, [volume]);

  return (
    <div className="relative">
      {/* Hidden YouTube player - must be in the DOM but visually hidden */}
      <div
        ref={containerRef}
        className="absolute overflow-hidden"
        style={{
          width: '1px',
          height: '1px',
          opacity: 0,
          pointerEvents: 'none',
          position: 'absolute',
          top: '-9999px',
          left: '-9999px',
        }}
        aria-hidden="true"
      />

      {/* Audio Visualizer UI */}
      {showVisualizer && (
        <div className="flex flex-col items-center justify-center py-8">
          {/* Vinyl + Audio Bars Combo */}
          <div className="relative">
            {/* Spinning Vinyl */}
            <div
              className={`relative w-44 h-44 rounded-full bg-zinc-900 border-4 border-zinc-800 shadow-2xl flex items-center justify-center ${
                isPlaying ? 'animate-spin-slow' : ''
              }`}
            >
              {/* Vinyl grooves */}
              <div className="absolute inset-4 rounded-full border border-zinc-700/40" />
              <div className="absolute inset-8 rounded-full border border-zinc-700/30" />
              <div className="absolute inset-12 rounded-full border border-zinc-700/20" />
              {/* Center label */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-xl shadow-inner">
                {isPlaying ? '🎵' : '🏍️'}
              </div>
            </div>

            {/* Audio Bars Overlay (positioned around vinyl) */}
            {isPlaying && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-end gap-1">
                {[...Array(7)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-gradient-to-t from-purple-500 to-cyan-400"
                    style={{
                      animation: `audio-bar ${0.5 + Math.random() * 0.5}s ease-in-out infinite alternate`,
                      animationDelay: `${i * 0.1}s`,
                      height: '8px',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Status Text */}
          <div className="mt-4 text-center space-y-2">
            {isLoading && (
              <p className="text-[var(--text-muted)] text-sm flex items-center gap-2 justify-center">
                <span className="inline-block w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                กำลังโหลดเพลง...
              </p>
            )}

            {isPlaying && (
              <p className="text-[var(--accent-cyan)] font-semibold text-sm animate-pulse">
                🎧 กำลังเล่นเพลง — ฟังแล้วเดาว่าเป็นไรเดอร์ตัวไหน!
              </p>
            )}

            {needsManualPlay && (
              <div className="space-y-3">
                <p className="text-amber-400 text-sm">
                  ⚠️ เบราว์เซอร์บล็อก autoplay — กดปุ่มด้านล่างเพื่อเล่นเพลง
                </p>
                <button
                  onClick={handleManualPlay}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-bold text-lg shadow-lg hover:shadow-purple-500/30 transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  ▶️ เล่นเพลง
                </button>
              </div>
            )}

            {!isPlaying && !isLoading && !needsManualPlay && (
              <p className="text-[var(--text-muted)] text-sm">
                🎵 รอเพลงเริ่มเล่น...
              </p>
            )}
          </div>
        </div>
      )}

      {/* CSS Animations for audio bars */}
      <style jsx>{`
        @keyframes audio-bar {
          0% {
            height: 4px;
          }
          100% {
            height: ${20 + Math.random() * 16}px;
          }
        }
      `}</style>
    </div>
  );
}
