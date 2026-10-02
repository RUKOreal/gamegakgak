'use client';

import React, { useState } from 'react';

interface AlbumArtProps {
  songTitle: string;
  series: string;
  artist: string;
  albumTitle?: string;
  era?: 'Showa' | 'Heisei' | 'Reiwa' | string;
  themeColor?: string;
  coverUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  showVinyl?: boolean;
  isSpinning?: boolean;
  className?: string;
}

export function AlbumArt({
  songTitle,
  series,
  artist,
  albumTitle,
  era = 'Heisei',
  themeColor = '#7c3aed',
  coverUrl,
  size = 'md',
  showVinyl = true,
  isSpinning = false,
  className = '',
}: AlbumArtProps) {
  const [imageError, setImageError] = useState(false);

  // Dimension presets
  const sizeConfig = {
    sm: {
      wrapper: 'w-24 h-24',
      sleeve: 'w-24 h-24',
      vinyl: 'w-20 h-20 -right-6',
      title: 'text-xs',
      series: 'text-[10px]',
      badge: 'text-[9px] px-1.5 py-0.5',
      iconSize: 20,
    },
    md: {
      wrapper: 'w-48 h-48 sm:w-56 sm:h-56',
      sleeve: 'w-48 h-48 sm:w-56 sm:h-56',
      vinyl: 'w-40 h-40 sm:w-48 sm:h-48 -right-12 sm:-right-16',
      title: 'text-sm sm:text-base',
      series: 'text-xs',
      badge: 'text-[10px] px-2 py-0.5',
      iconSize: 32,
    },
    lg: {
      wrapper: 'w-64 h-64 sm:w-72 sm:h-72',
      sleeve: 'w-64 h-64 sm:w-72 sm:h-72',
      vinyl: 'w-56 h-56 sm:w-64 sm:h-64 -right-16 sm:-right-20',
      title: 'text-base sm:text-lg',
      series: 'text-sm',
      badge: 'text-xs px-2.5 py-1',
      iconSize: 44,
    },
  }[size];

  const eraColors: Record<string, { bg: string; text: string; border: string }> = {
    Reiwa: { bg: 'from-emerald-500/20 to-teal-500/30', text: 'text-emerald-300', border: 'border-emerald-500/40' },
    Heisei: { bg: 'from-purple-500/20 to-indigo-500/30', text: 'text-purple-300', border: 'border-purple-500/40' },
    Showa: { bg: 'from-amber-500/20 to-rose-500/30', text: 'text-amber-300', border: 'border-amber-500/40' },
  };

  const currentEra = eraColors[era] || eraColors.Heisei;

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Vinyl Disc (Slips out from behind sleeve) */}
      {showVinyl && (
        <div
          className={`absolute ${sizeConfig.vinyl} rounded-full bg-zinc-950 border-4 border-zinc-900 shadow-2xl z-0 transition-transform duration-700 ease-out flex items-center justify-center ${
            isSpinning ? 'animate-spin-slow' : 'group-hover:translate-x-3'
          }`}
          style={{
            boxShadow: `0 10px 30px rgba(0,0,0,0.8), 0 0 20px ${themeColor}33`,
          }}
        >
          {/* Vinyl Grooves */}
          <div className="absolute inset-2 rounded-full border border-zinc-800/60" />
          <div className="absolute inset-5 rounded-full border border-zinc-800/40" />
          <div className="absolute inset-8 rounded-full border border-zinc-800/30" />
          <div className="absolute inset-11 rounded-full border border-zinc-800/20" />

          {/* Vinyl Center Label */}
          <div
            className="w-1/3 h-1/3 rounded-full flex flex-col items-center justify-center shadow-inner relative z-10 p-1"
            style={{
              background: `radial-gradient(circle, ${themeColor} 0%, #18181b 100%)`,
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-950 border border-zinc-700" />
            <span className="text-[7px] font-bold text-white/90 tracking-tighter truncate max-w-full uppercase mt-0.5">
              RIDER
            </span>
          </div>

          {/* Grooves light reflection */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/5 via-transparent to-white/5 pointer-events-none" />
        </div>
      )}

      {/* Album Sleeve / Jacket */}
      <div
        className={`relative ${sizeConfig.sleeve} rounded-2xl overflow-hidden z-10 shadow-2xl border border-white/10 transition-all duration-300 group`}
        style={{
          boxShadow: `0 20px 40px rgba(0,0,0,0.6), 0 0 35px ${themeColor}40`,
        }}
      >
        {coverUrl && !imageError ? (
          // Custom Cover Image
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={`${songTitle} - ${series} Album Cover`}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          // Procedural Stylized Rider CD Cover
          <div
            className="w-full h-full flex flex-col justify-between p-4 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, #18181b 0%, #09090b 60%, ${themeColor}22 100%)`,
            }}
          >
            {/* Top Bar: Era Badge & Audio wave */}
            <div className="flex items-center justify-between z-10">
              <span
                className={`rounded-full border font-bold uppercase tracking-wider ${sizeConfig.badge} bg-gradient-to-r ${currentEra.bg} ${currentEra.text} ${currentEra.border}`}
              >
                {era} RIDER
              </span>
              <span className="text-xs opacity-75">CD SINGLE</span>
            </div>

            {/* Center: Stylized Emblem & Neon Motif */}
            <div className="my-auto text-center z-10 space-y-1">
              <div
                className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110"
                style={{
                  background: `linear-gradient(135deg, ${themeColor} 0%, #1e1b4b 100%)`,
                  boxShadow: `0 0 25px ${themeColor}60`,
                }}
              >
                <span className="text-2xl">🏍️</span>
              </div>
              <p
                className={`font-black tracking-tight ${sizeConfig.title} text-white drop-shadow-md line-clamp-1`}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {songTitle}
              </p>
              <p className={`font-semibold ${sizeConfig.series} text-[var(--accent-cyan)] line-clamp-1`}>
                {series}
              </p>
            </div>

            {/* Bottom Bar: Artist & Record company tag */}
            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] z-10 border-t border-white/10 pt-2">
              <span className="truncate max-w-[70%] font-medium">{artist}</span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">STEREO</span>
            </div>

            {/* CD Jewel Case Gloss Reflection */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none" />
            <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-white/15 to-transparent transform rotate-45 pointer-events-none" />
          </div>
        )}

        {/* Outer Sleeve Spine Highlight */}
        <div className="absolute top-0 left-0 w-1.5 h-full bg-white/15 backdrop-blur-sm pointer-events-none" />
      </div>
    </div>
  );
}
