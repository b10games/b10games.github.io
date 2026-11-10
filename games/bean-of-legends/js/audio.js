// Music and sound effects for Bean of Legends, all made in the browser with WebAudio (no audio files).
import { rng } from './engine.js';

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10]
};
const PROGS = [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 4], [5, 3, 0, 4], [0, 2, 3, 4]];

export class Audio {
  constructor() {
    this.ctx = null; this.music = null; this.vol = { music: 0.55, sfx: 0.8 };
    try { const v = JSON.parse(localStorage.getItem('bol-vol')); if (v) this.vol = v; } catch (e) {}
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.mGain = this.ctx.createGain(); this.mGain.gain.value = this.vol.music; this.mGain.connect(this.master);
      this.sGain = this.ctx.createGain(); this.sGain.gain.value = this.vol.sfx; this.sGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.pending) { const p = this.pending; this.pending = null; this.play(p); }
    } catch (e) { this.ctx = null; }
  }
  setVolume(kind, v) {
    this.vol[kind] = v;
    try { localStorage.setItem('bol-vol', JSON.stringify(this.vol)); } catch (e) {}
    if (!this.ctx) return;
    (kind === 'music' ? this.mGain : this.sGain).gain.value = v;
  }

  // ---------- music ----------
  play(params) {
    if (!this.ctx) { this.pending = params; return; }
    if (this.music && this.music.params === params) return;
    this.stop();
    const ctx = this.ctx, r = rng(params.seed || 1), sc = SCALES[params.scale] || SCALES.major;
    const prog = PROGS[Math.floor(r() * PROGS.length)];
    const step = 60 / params.bpm / 4;
    // a 2-bar melody motif repeated with a variation
    const motif = [];
    let deg = 7 + Math.floor(r() * 4);
    for (let i = 0; i < 32; i++) {
      const rest = r() < (i % 4 === 0 ? 0.1 : 0.42);
      if (!rest) deg = Math.max(4, Math.min(13, deg + [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(r() * 8)]));
      motif.push(rest ? null : deg);
    }
    const bassRhythm = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0].map(x => x || (r() < 0.12 ? 1 : 0));
    const out = ctx.createGain(); out.gain.value = 0; out.connect(this.mGain);
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
    const m = { params, out, i: 0, next: ctx.currentTime + 0.1, timer: null };
    const note = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const degNote = (d, oct = 0) => params.root + sc[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
    const sched = () => {
      while (m.next < ctx.currentTime + 0.25) {
        const i = m.i, t = m.next, bar = Math.floor(i / 16) % 4, s = i % 16, chord = prog[bar];
        // drums
        this.drum(params.drums, s, t, out, i);
        // bass
        if (bassRhythm[s]) this.tone(out, params.bass || 'triangle', note(degNote(chord, -2) - (s === 12 && r() < 0.3 ? 2 : 0)), t, step * 1.6, 0.16);
        // chord stabs / pads
        if (s === 0 || (params.drums === 'bouncy' && s === 8) || (params.drums === 'electro' && s % 4 === 2)) {
          [0, 2, 4].forEach(k => this.tone(out, params.drums === 'electro' ? 'sawtooth' : 'triangle', note(degNote(chord + k, -1)), t, step * (params.drums === 'electro' ? 1.5 : 6), 0.035));
        }
        // lead
        const half = Math.floor(i / 32) % 2, md = motif[(i % 32)];
        if (md != null && s % 2 === 0) this.tone(out, params.lead || 'square', note(degNote(md + (half && s > 7 ? 2 : 0) + chord % 2)), t, step * 1.8, params.lead === 'sine' ? 0.09 : 0.05);
        // sparkle arpeggio
        if (params.drums === 'electro' || params.scale === 'lydian') if (s % 2 === 1) this.tone(out, 'sine', note(degNote(chord + [0, 2, 4, 7][(s >> 1) % 4], 1)), t, step * 0.8, 0.025);
        m.i++; m.next += step;
      }
    };
    sched();
    m.timer = setInterval(sched, 60);
    this.music = m;
  }
  stop() {
    const m = this.music;
    if (!m) return;
    clearInterval(m.timer);
    try { m.out.gain.cancelScheduledValues(this.ctx.currentTime); m.out.gain.setValueAtTime(m.out.gain.value, this.ctx.currentTime); m.out.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6); } catch (e) {}
    setTimeout(() => { try { m.out.disconnect(); } catch (e) {} }, 800);
    this.music = null;
  }
  tone(dest, type, f, t, dur, vol) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  hit(dest, t, f0, f1, dur, vol, type = 'sine') {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  noiseHit(dest, t, dur, vol, hp = 6000) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  drum(style, s, t, out, i) {
    const kick = () => this.hit(out, t, 150, 45, 0.22, 0.5);
    const snare = () => { this.noiseHit(out, t, 0.14, 0.22, 1500); this.hit(out, t, 230, 160, 0.08, 0.15, 'triangle'); };
    const hat = (v = 0.06) => this.noiseHit(out, t, 0.04, v, 8000);
    switch (style) {
      case 'heavy': if (s % 4 === 0 || s === 10) kick(); if (s === 4 || s === 12) snare(); if (s % 2 === 0) hat(0.05); break;
      case 'tribal': if (s % 4 === 0) kick(); if (s === 6 || s === 14 || s === 11) this.hit(out, t, 320, 180, 0.12, 0.2, 'triangle'); if (s % 2) hat(0.03); break;
      case 'electro': if (s % 4 === 0) kick(); if (s === 4 || s === 12) snare(); hat(s % 2 ? 0.07 : 0.03); break;
      case 'march': if (s === 0 || s === 8) kick(); if (s === 4 || s === 12 || s === 14) snare(); break;
      case 'funky': if (s === 0 || s === 7 || s === 10) kick(); if (s === 4 || s === 12) snare(); if (s % 2 === 0 || s === 15) hat(0.05); break;
      case 'light': if (s === 0 || s === 8) kick(); if (s === 12) snare(); if (s % 4 === 2) hat(0.04); break;
      default: if (s % 8 === 0 || s === 6) kick(); if (s === 4 || s === 12) snare(); if (s % 2 === 0) hat(0.045);
    }
  }

  // ---------- sound effects ----------
  sfx(name, vol = 1) {
    if (!this.ctx || this.vol.sfx <= 0) return;
    const now = this.ctx.currentTime;
    // the same sound many times in one moment would just be noise
    this.last = this.last || {};
    if (this.last[name] && now - this.last[name] < 0.04) return;
    this.last[name] = now;
    const t = now, o = this.sGain, v = vol;
    switch (name) {
      case 'swing': this.noiseHit(o, t, 0.12, 0.18 * v, 2500); this.hit(o, t, 300, 160, 0.1, 0.12 * v, 'triangle'); break;
      case 'shoot': this.hit(o, t, 900, 300, 0.12, 0.1 * v, 'square'); break;
      case 'hit': this.hit(o, t, 260, 80, 0.14, 0.22 * v, 'square'); this.noiseHit(o, t, 0.08, 0.12 * v, 1800); break;
      case 'crit': this.hit(o, t, 520, 90, 0.22, 0.3 * v, 'sawtooth'); this.noiseHit(o, t, 0.15, 0.2 * v, 1200); break;
      case 'magic': this.hit(o, t, 500, 1300, 0.25, 0.12 * v, 'sine'); this.hit(o, t + 0.05, 800, 1700, 0.2, 0.08 * v, 'triangle'); break;
      case 'cast': this.hit(o, t, 300, 900, 0.18, 0.14 * v, 'triangle'); this.noiseHit(o, t, 0.15, 0.08 * v, 4000); break;
      case 'boom': this.hit(o, t, 140, 35, 0.6, 0.45 * v); this.noiseHit(o, t, 0.5, 0.35 * v, 300); break;
      case 'dash': this.noiseHit(o, t, 0.25, 0.25 * v, 900); this.hit(o, t, 400, 1200, 0.2, 0.1 * v, 'sawtooth'); break;
      case 'shield': this.hit(o, t, 600, 900, 0.3, 0.12 * v, 'sine'); this.hit(o, t, 900, 1350, 0.3, 0.08 * v, 'sine'); break;
      case 'heal': [660, 880, 1100].forEach((f, i) => this.tone(o, 'sine', f, t + i * 0.06, 0.25, 0.08 * v)); break;
      case 'tower': this.hit(o, t, 700, 200, 0.3, 0.16 * v, 'sawtooth'); this.noiseHit(o, t, 0.2, 0.1 * v, 3000); break;
      case 'towerDown': this.hit(o, t, 120, 30, 1.2, 0.5 * v); this.noiseHit(o, t, 1.1, 0.4 * v, 200); [392, 330, 262].forEach((f, i) => this.tone(o, 'square', f, t + 0.2 + i * 0.15, 0.25, 0.08 * v)); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.07, 0.2, 0.1 * v)); break;
      case 'buy': [988, 1318].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.08, 0.15, 0.1 * v)); this.noiseHit(o, t, 0.05, 0.06 * v, 6000); break;
      case 'sell': [1318, 988].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.08, 0.15, 0.08 * v)); break;
      case 'gold': this.tone(o, 'square', 1568, t, 0.08, 0.05 * v); this.tone(o, 'square', 2093, t + 0.05, 0.1, 0.05 * v); break;
      case 'death': [392, 349, 311, 262].forEach((f, i) => this.tone(o, 'triangle', f, t + i * 0.12, 0.2, 0.13 * v)); break;
      case 'kill': [784, 988, 1175, 1568].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.06, 0.18, 0.1 * v)); break;
      case 'recall': this.hit(o, t, 200, 800, 1.2, 0.1 * v, 'sine'); break;
      case 'teleport': this.hit(o, t, 1200, 300, 0.4, 0.14 * v, 'sine'); this.noiseHit(o, t, 0.3, 0.1 * v, 5000); break;
      case 'roar': this.hit(o, t, 180, 70, 0.7, 0.35 * v, 'sawtooth'); this.noiseHit(o, t, 0.6, 0.2 * v, 400); break;
      case 'splat': this.noiseHit(o, t, 0.25, 0.3 * v, 500); this.hit(o, t, 300, 90, 0.2, 0.2 * v, 'sine'); break;
      case 'slip': this.hit(o, t, 300, 1200, 0.3, 0.15 * v, 'triangle'); this.hit(o, t + 0.15, 1200, 200, 0.4, 0.12 * v, 'triangle'); break;
      case 'poof': this.noiseHit(o, t, 0.35, 0.22 * v, 1500); break;
      case 'laser': this.hit(o, t, 1800, 400, 0.35, 0.14 * v, 'sawtooth'); break;
      case 'click': this.hit(o, t, 900, 600, 0.05, 0.1 * v, 'square'); break;
      case 'hover': this.hit(o, t, 1200, 1300, 0.03, 0.03 * v, 'sine'); break;
      case 'error': this.tone(o, 'square', 196, t, 0.18, 0.1 * v); break;
      case 'announce': [659, 784, 988].forEach((f, i) => this.tone(o, 'triangle', f, t + i * 0.09, 0.3, 0.12 * v)); break;
      case 'alarm': [880, 660, 880].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.14, 0.12, 0.09 * v)); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.13, 0.32, 0.14 * v)); break;
      case 'defeat': [392, 370, 349, 294].forEach((f, i) => this.tone(o, 'sawtooth', f, t + i * 0.28, 0.4, 0.11 * v)); break;
      case 'select': this.hit(o, t, 600, 1200, 0.12, 0.12 * v, 'triangle'); break;
      case 'lockin': [392, 523, 659, 784].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.05, 0.3, 0.12 * v)); this.hit(o, t, 150, 50, 0.4, 0.3 * v); break;
      case 'step': this.noiseHit(o, t, 0.05, 0.05 * v, 900); this.hit(o, t, 140, 90, 0.05, 0.05 * v, 'sine'); break;
      case 'mhit': this.hit(o, t, 520 + Math.random() * 200, 260, 0.06, 0.05 * v, 'triangle'); break;
    }
  }
}
export const MUSIC = {
  menu: { bpm: 112, scale: 'lydian', root: 62, lead: 'triangle', bass: 'triangle', drums: 'light', seed: 41 },
  select: { bpm: 120, scale: 'dorian', root: 57, lead: 'square', bass: 'triangle', drums: 'funky', seed: 9 },
  match: { bpm: 126, scale: 'mixolydian', root: 55, lead: 'square', bass: 'triangle', drums: 'heavy', seed: 23 },
  late: { bpm: 138, scale: 'minor', root: 57, lead: 'sawtooth', bass: 'sawtooth', drums: 'electro', seed: 71 }
};
