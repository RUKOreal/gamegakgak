'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { YouTubeAudioPlayer } from './YouTubeAudioPlayer';

interface AudioTrackPlayerProps {
  audioUrl?: string;
  youtubeId?: string;
  autoPlay?: boolean;
  themeColor?: string;
  randomizeSection?: boolean;
  roundKey?: number | string;
  onEnded?: () => void;
}

export function AudioTrackPlayer({
  audioUrl,
  youtubeId,
  autoPlay = true,
  themeColor = '#7c3aed',
  randomizeSection = true,
  roundKey,
  onEnded,
}: AudioTrackPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [useFallbackYT, setUseFallbackYT] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const applyRandomSection = useCallback((dur: number) => {
    if (!randomizeSection || isNaN(dur) || dur <= 0) {
      setStartTime(0);
      return 0;
    }
    // Round limit is ~15s, leave 18s at end
    const maxStart = Math.max(0, dur - 18);
    if (maxStart <= 5) {
      setStartTime(0);
      return 0;
    }

    const randomSec = Math.floor(Math.random() * maxStart);
    setStartTime(randomSec);
    return randomSec;
  }, [randomizeSection]);

  // Handle new track or new round
  useEffect(() => {
    setAudioError(false);
    setUseFallbackYT(false);

    if (!audioUrl) {
      if (youtubeId && youtubeId !== 'PLACEHOLDER') {
        setUseFallbackYT(true);
      }
      return;
    }

    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;

      const onMeta = () => {
        const dur = audio.duration;
        setDuration(dur);
        const startSec = applyRandomSection(dur);
        audio.currentTime = startSec;
        setCurrentTime(startSec);

        if (autoPlay) {
          audio.play().then(() => {
            setIsPlaying(true);
          }).catch((err) => {
            console.warn('HTML5 Audio autoplay prevented:', err);
            setIsPlaying(false);
          });
        }
      };

      if (audio.readyState >= 1) {
        onMeta();
      } else {
        audio.addEventListener('loadedmetadata', onMeta, { once: true });
      }
    }

    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [audioUrl, roundKey, autoPlay, volume, youtubeId, applyRandomSection]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleReroll = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const dur = audio.duration || duration;
    if (!dur || isNaN(dur)) return;

    const maxStart = Math.max(0, dur - 18);
    if (maxStart > 5) {
      const newStart = Math.floor(Math.random() * maxStart);
      setStartTime(newStart);
      audio.currentTime = newStart;
      setCurrentTime(newStart);

      if (!isPlaying) {
        audio.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  // If local audio fails and we have a youtubeId fallback
  if (useFallbackYT && youtubeId && youtubeId !== 'PLACEHOLDER') {
    return (
      <YouTubeAudioPlayer
        youtubeId={youtubeId}
        autoPlay={autoPlay}
        startTime={startTime > 0 ? startTime : 0}
        endTime={30}
        volume={Math.round(volume * 100)}
        showVisualizer={true}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-2 w-full">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            if (onEnded) onEnded();
          }}
          onError={() => {
            console.warn('Audio failed to load:', audioUrl);
            setAudioError(true);
            if (youtubeId && youtubeId !== 'PLACEHOLDER') {
              setUseFallbackYT(true);
            }
          }}
        />
      )}

      {/* Section indicator badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-xs font-bold text-purple-300 flex items-center gap-1.5 shadow-sm">
          <span>{randomizeSection ? '🎲 สุ่มท่อนเริ่ม:' : '▶️ ต้นเพลง:'}</span>
          <span className="text-cyan-300 font-mono text-sm">{formatTime(startTime)}</span>
          {duration > 0 && <span className="text-white/40">/ {formatTime(duration)}</span>}
        </span>

        {randomizeSection && duration > 20 && (
          <button
            onClick={handleReroll}
            className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-[11px] font-semibold text-white/80 hover:text-white transition-all flex items-center gap-1 shadow-sm active:scale-95"
            title="สุ่มท่อนใหม่"
          >
            <span>🎲 สุ่มท่อนใหม่</span>
          </button>
        )}
      </div>

      {/* Spinning Vinyl & Visualizer Container */}
      <div className="relative flex flex-col items-center gap-3 my-0.5">
        {/* Vinyl Record */}
        <div className="relative w-28 h-28 rounded-full bg-zinc-950 border-4 border-zinc-800 shadow-[0_0_30px_rgba(0,0,0,0.8)] flex items-center justify-center">
          {/* Vinyl grooves */}
          <div className="absolute inset-2 rounded-full border border-zinc-800/80" />
          <div className="absolute inset-4 rounded-full border border-zinc-800/60" />
          <div className="absolute inset-6 rounded-full border border-zinc-800/40" />

          {/* Center label with rotating animation */}
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-inner cursor-pointer transition-transform ${
              isPlaying ? 'animate-spin-slow' : ''
            }`}
            style={{
              background: `radial-gradient(circle, ${themeColor} 0%, #1e1b4b 100%)`,
            }}
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <span>🏍️</span>
          </div>

          {/* Center spindle hole */}
          <div className="absolute w-2.5 h-2.5 rounded-full bg-zinc-900 border border-zinc-600 pointer-events-none" />

          {/* Playing indicator badge */}
          <div className="absolute -bottom-2 px-2.5 py-0.5 rounded-full bg-black/80 border border-white/20 text-[10px] font-bold text-cyan-300 backdrop-blur-md flex items-center gap-1 shadow-lg">
            <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-cyan-400 animate-ping' : 'bg-zinc-500'}`} />
            <span>{isPlaying ? `${formatTime(currentTime)}` : 'Play'}</span>
          </div>
        </div>

        {/* Animated Equalizer Visualizer Bars */}
        <div className="flex items-end justify-center gap-1.5 h-7 px-4 py-1.5 rounded-xl bg-black/30 border border-white/10 backdrop-blur-md shadow-inner">
          {[
            { delay: '0.0s', height: 'h-8' },
            { delay: '0.2s', height: 'h-10' },
            { delay: '0.1s', height: 'h-6' },
            { delay: '0.4s', height: 'h-11' },
            { delay: '0.3s', height: 'h-7' },
            { delay: '0.15s', height: 'h-12' },
            { delay: '0.35s', height: 'h-9' },
            { delay: '0.05s', height: 'h-11' },
            { delay: '0.25s', height: 'h-8' },
            { delay: '0.45s', height: 'h-6' },
            { delay: '0.1s', height: 'h-10' },
            { delay: '0.3s', height: 'h-7' },
          ].map((bar, i) => (
            <div
              key={i}
              className={`w-1.5 rounded-full transition-all duration-200 ${
                isPlaying
                  ? 'bg-gradient-to-t from-purple-500 to-cyan-400 animate-pulse'
                  : 'bg-white/20 h-2'
              }`}
              style={{
                height: isPlaying ? undefined : '8px',
                animationDuration: '0.6s',
                animationDelay: bar.delay,
              }}
            />
          ))}
        </div>

        {/* Volume & Play Controls */}
        <div className="flex items-center gap-4 text-xs text-white/60">
          <button
            onClick={togglePlay}
            className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium transition-all"
          >
            {isPlaying ? '⏸️ หยุดชั่วคราว' : '▶️ เล่นเสียง'}
          </button>

          <div className="flex items-center gap-2">
            <span>🔊</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20 accent-cyan-400 cursor-pointer h-1.5 bg-white/20 rounded-lg"
              title="ระดับเสียง"
            />
          </div>
        </div>

        {audioError && !useFallbackYT && (
          <p className="text-rose-400 text-xs text-center">
            ⚠️ ไม่สามารถโหลดไฟล์เสียงนี้ได้
          </p>
        )}
      </div>
    </div>
  );
}
