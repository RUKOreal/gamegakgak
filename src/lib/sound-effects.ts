/**
 * Web Audio API Sound Effects
 * Generates procedural game audio with zero external dependencies.
 * Safe for SSR and respects browser autoplay restrictions.
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public unlock() {
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  // Play single synthesized tone
  private playTone(freq: number, type: OscillatorType, duration: number, gainValue = 0.15, delay = 0) {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

    gain.gain.setValueAtTime(gainValue, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration);
  }

  /**
   * Correct Answer Chime: C5 -> E5 -> G5 -> C6
   */
  public playCorrect() {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'sine', 0.18, 0.2, idx * 0.08);
    });
  }

  /**
   * Wrong Answer Buzzer: Low descending dissonant tone
   */
  public playWrong() {
    this.playTone(220, 'sawtooth', 0.25, 0.25, 0);
    this.playTone(180, 'sawtooth', 0.35, 0.25, 0.1);
  }

  /**
   * Timer Tick (subtle woodblock tick)
   */
  public playTick() {
    this.playTone(800, 'triangle', 0.04, 0.08, 0);
  }

  /**
   * Urgent Timer Warning (last 5 seconds)
   */
  public playUrgentTick() {
    this.playTone(980, 'square', 0.06, 0.12, 0);
    this.playTone(1175, 'square', 0.06, 0.12, 0.08);
  }

  /**
   * Game Start Fanfare
   */
  public playStart() {
    const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'triangle', 0.25, 0.2, idx * 0.1);
    });
  }

  /**
   * Victory Fanfare (Game finished / Podium)
   */
  public playVictory() {
    const sequence = [
      { freq: 523.25, delay: 0, dur: 0.15 },     // C5
      { freq: 523.25, delay: 0.15, dur: 0.15 },  // C5
      { freq: 523.25, delay: 0.3, dur: 0.15 },   // C5
      { freq: 659.25, delay: 0.45, dur: 0.3 },   // E5
      { freq: 587.33, delay: 0.8, dur: 0.15 },   // D5
      { freq: 659.25, delay: 0.95, dur: 0.15 },  // E5
      { freq: 783.99, delay: 1.15, dur: 0.5 },   // G5
    ];
    sequence.forEach((note) => {
      this.playTone(note.freq, 'sine', note.dur, 0.25, note.delay);
    });
  }
}

export const sounds = new SoundManager();
