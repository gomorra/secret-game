/**
 * Small synthesized sound effects with Web Audio. No files to download.
 * The audio context starts on the first click or key press, as browsers require.
 */

export type SoundId =
  | 'place'
  | 'road'
  | 'demolish'
  | 'error'
  | 'click'
  | 'coin'
  | 'toll'
  | 'whisper'
  | 'find'
  | 'page'
  | 'upgrade'
  | 'goal'
  | 'lost'
  | 'save';

const SETTINGS_KEY = 'fogbound.settings.v1';

/** Shortest gap between two plays of the same sound, in seconds. */
const MIN_GAP: Partial<Record<SoundId, number>> = {
  road: 0.06,
  place: 0.05,
  coin: 0.12,
  upgrade: 0.3,
  find: 0.4,
  whisper: 1.5,
  toll: 2,
  click: 0.03,
};

export class Sound {
  muted = false;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<SoundId, number>();
  private drone: { gain: GainNode; level: number } | null = null;
  private listeners: (() => void)[] = [];

  constructor() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.muted = !!JSON.parse(raw).muted;
    } catch {
      // No settings: sound on.
    }
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted }));
    } catch {
      // Not remembered, but still applied.
    }
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
    for (const fn of this.listeners) fn();
  }

  toggleMute(): void {
    this.setMuted(!this.muted);
    if (!this.muted) this.play('click');
  }

  private unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.out = this.ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 0.7;
    this.out.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  play(id: SoundId): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.last.get(id) ?? -1e9) < (MIN_GAP[id] ?? 0.05)) return;
    this.last.set(id, now);
    const t = now + 0.005;
    switch (id) {
      case 'place':
        this.noise(t, 0.09, 'lowpass', 900, 0.8, 0.5);
        this.tone(t, 0.14, 'sine', 170, 0.45, 0.004, 80);
        break;
      case 'road':
        this.noise(t, 0.05, 'bandpass', 1400, 1.2, 0.25);
        break;
      case 'demolish':
        this.noise(t, 0.3, 'lowpass', 700, 0.7, 0.55);
        this.tone(t, 0.3, 'sine', 120, 0.4, 0.004, 45);
        break;
      case 'error':
        this.tone(t, 0.09, 'triangle', 196, 0.18, 0.004);
        this.tone(t + 0.1, 0.14, 'triangle', 147, 0.18, 0.004);
        break;
      case 'click':
        this.tone(t, 0.04, 'sine', 880, 0.08, 0.002);
        break;
      case 'coin':
        this.tone(t, 0.09, 'triangle', 1319, 0.12, 0.002);
        this.tone(t + 0.07, 0.22, 'triangle', 1760, 0.12, 0.002);
        break;
      case 'save':
        this.tone(t, 0.12, 'sine', 660, 0.05, 0.01);
        break;
      case 'toll':
        this.bell(t, 98);
        break;
      case 'whisper':
        this.whisper(t);
        break;
      case 'lost':
        this.tone(t, 2.2, 'sine', 233, 0.16, 0.3, 110);
        this.whisper(t + 0.3);
        break;
      case 'find':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.09, 0.9, 'sine', f, 0.1, 0.005));
        break;
      case 'page':
        this.noise(t, 0.12, 'highpass', 2500, 0.7, 0.18);
        this.noise(t + 0.14, 0.16, 'highpass', 3200, 0.7, 0.14);
        this.tone(t + 0.1, 1.2, 'sine', 587, 0.06, 0.05);
        break;
      case 'upgrade':
        [392, 523, 659].forEach((f, i) => this.tone(t + i * 0.08, 0.5, 'triangle', f, 0.11, 0.004));
        break;
      case 'goal':
        this.tone(t, 0.6, 'sine', 659, 0.12, 0.005);
        this.tone(t + 0.12, 1.0, 'sine', 988, 0.12, 0.005);
        break;
    }
  }

  /** A low drone under a fog surge, 0..1. */
  setDrone(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    level = this.muted ? 0 : Math.max(0, Math.min(1, level));
    if (!this.drone) {
      if (level <= 0.01) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 160;
      lp.connect(gain).connect(this.out);
      for (const f of [55, 55.6, 82.4]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(lp);
        o.start();
      }
      this.drone = { gain, level: 0 };
    }
    if (Math.abs(level - this.drone.level) < 0.02) return;
    this.drone.level = level;
    this.drone.gain.gain.setTargetAtTime(level * 0.09, ctx.currentTime, 0.6);
  }

  // -------------------------------------------------------------------------
  // Building blocks

  private tone(t: number, dur: number, type: OscillatorType, freq: number, gain: number, attack: number, freqEnd?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.004, freqEnd?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** A big bronze bell heard through water: inharmonic partials, long decay, muffled top. */
  private bell(t: number, base: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.connect(this.out!);
    const partials: [number, number, number][] = [
      // ratio, gain, decay seconds
      [0.5, 0.22, 7],
      [1, 0.2, 6],
      [1.19, 0.12, 4.5],
      [1.5, 0.08, 4],
      [2, 0.12, 3.5],
      [2.52, 0.06, 2.5],
      [3.01, 0.05, 2],
      [4.2, 0.03, 1.4],
    ];
    for (const [ratio, gain, decay] of partials) {
      for (const detune of [-0.6, 0.6]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = base * ratio + detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain / 2, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + decay + 0.1);
      }
    }
    // The strike: a dull thud under the ring.
    this.noise(t, 0.25, 'lowpass', 300, 0.7, 0.3);
  }

  /** Breathy voices: narrow bands of noise that drift up and down. */
  private whisper(t: number): void {
    const ctx = this.ctx!;
    for (let k = 0; k < 2; k++) {
      const start = t + k * 0.35;
      const dur = 1.8 + Math.random() * 0.8;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 9;
      const f0 = 700 + Math.random() * 500;
      f.frequency.setValueAtTime(f0, start);
      f.frequency.linearRampToValueAtTime(f0 * 1.6, start + dur * 0.4);
      f.frequency.linearRampToValueAtTime(f0 * 0.9, start + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(0.22, start + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, start + dur);
      const pan = ctx.createStereoPanner?.();
      if (pan) {
        pan.pan.value = Math.random() * 1.6 - 0.8;
        src.connect(f).connect(g).connect(pan).connect(this.out!);
      } else src.connect(f).connect(g).connect(this.out!);
      src.start(start, Math.random());
      src.stop(start + dur + 0.05);
    }
  }
}
