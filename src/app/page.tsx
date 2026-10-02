'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [demoMode, setDemoMode] = useState(false);
  const [isProduction, setIsProduction] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => setDemoMode(data.demoMode))
      .catch(() => setDemoMode(true));

    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setIsProduction(true);
    }
  }, []);

  const handleCreateRoom = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/rooms/create', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      // Store host info in sessionStorage
      sessionStorage.setItem('hostId', data.hostId);
      sessionStorage.setItem('roomId', data.roomId);
      sessionStorage.setItem('roomCode', data.roomCode);
      router.push(`/host/${data.roomCode}`);
    } catch {
      setError('Failed to create room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomCode.trim() || !nickname.trim()) {
      setError('Please enter both room code and nickname.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: roomCode.trim().toUpperCase(), nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      // Store player info in sessionStorage
      sessionStorage.setItem('playerId', data.playerId);
      sessionStorage.setItem('nickname', data.nickname);
      sessionStorage.setItem('roomId', data.roomId);
      sessionStorage.setItem('roomCode', data.roomCode);
      router.push(`/play/${data.roomCode}`);
    } catch {
      setError('Failed to join room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo / Title */}
        <div className="text-center mb-12 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-500 mb-6 animate-float">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <h1 className="text-5xl font-black tracking-tight mb-3">
            <span className="brand-gradient">RIDER QUIZ</span>
          </h1>
          <p className="text-[var(--text-secondary)] text-lg">
            Kamen Rider Song Guessing Game
          </p>
        </div>

        {/* Demo Mode Production Alert */}
        {demoMode && isProduction && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs leading-relaxed animate-fade-in shadow-lg">
            <div className="flex items-start gap-2.5">
              <span className="text-lg leading-none">⚠️</span>
              <div className="space-y-1 text-left">
                <p className="font-bold text-amber-300">กำลังทำงานใน Demo Mode (In-Memory)</p>
                <p className="text-amber-200/80">
                  บน Vercel กรุณาตั้งค่า Supabase Environment Variables ใน Dashboard เพื่อให้ผู้เล่นเครื่องอื่นค้นหาห้องและเข้าร่วมได้
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mode Selection */}
        {mode === 'menu' && (
          <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="btn-primary w-full text-lg py-5"
              id="create-room-btn"
            >
              {loading ? (
                <span className="flex items-center gap-3">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating Room...
                </span>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  Create Room (Host)
                </>
              )}
            </button>

            <button
              onClick={() => setMode('join')}
              className="btn-secondary w-full text-lg py-5"
              id="join-room-btn"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10,17 15,12 10,7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Join Room (Player)
            </button>
          </div>
        )}

        {/* Join Form */}
        {mode === 'join' && (
          <div className="glass-card-static p-8 space-y-6 animate-fade-in-up">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Room Code
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-digit code"
                maxLength={6}
                className="input-field text-center text-2xl tracking-[0.3em] font-bold uppercase"
                id="room-code-input"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Your Nickname
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g., KamenFan99"
                maxLength={20}
                className="input-field"
                id="nickname-input"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setMode('menu');
                  setError('');
                }}
                className="btn-secondary flex-1"
              >
                Back
              </button>
              <button
                onClick={handleJoinRoom}
                disabled={loading || !roomCode.trim() || !nickname.trim()}
                className="btn-primary flex-1"
                id="submit-join-btn"
              >
                {loading ? 'Joining...' : 'Join Game'}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center animate-fade-in">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-[var(--text-muted)] text-sm">
          <p>🎭 Guess the Kamen Rider opening theme!</p>
          <p className="mt-1">Play with friends in real-time</p>
        </div>
      </div>
    </main>
  );
}
