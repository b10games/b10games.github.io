// Music and sound effects for Beans Tower Defense, all made in the browser with WebAudio (no audio files).
import { rng } from './engine.js';

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10]
};
const PROGS = [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 4], [5, 3, 0, 4], [0, 2, 3, 4]];

export class Audio {
  constructor() {
    this.ctx = null; this.music = null; this.vol = { master: 0.9, music: 0.45, sfx: 0.8, mute: false };
    try { const v = JSON.parse(localStorage.getItem('btd-vol')); if (v) Object.assign(this.vol, v); } catch (e) {}
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.gain.value = this.vol.mute ? 0 : this.vol.master; this.master.connect(this.ctx.destination);
      this.mGain = this.ctx.createGain(); this.mGain.gain.value = this.vol.music; this.mGain.connect(this.master);
      this.sGain = this.ctx.createGain(); this.sGain.gain.value = this.vol.sfx; this.sGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.pending) { const p = this.pending; this.pending = null; this.play(p); }
    } catch (e) { this.ctx = null; }
  }
  // kind: master | music | sfx | mute
  setVolume(kind, v) {
    this.vol[kind] = v;
    try { localStorage.setItem('btd-vol', JSON.stringify(this.vol)); } catch (e) {}
    if (!this.ctx) return;
    this.master.gain.value = this.vol.mute ? 0 : this.vol.master;
    this.mGain.gain.value = this.vol.music; this.sGain.gain.value = this.vol.sfx;
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
    if (!this.ctx || this.vol.sfx <= 0 || this.vol.mute) return;
    const now = this.ctx.currentTime;
    // the same sound many times in one moment would just be noise
    this.last = this.last || {};
    const gap = name === 'pop' ? 0.035 : 0.04;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    const t = now, o = this.sGain, v = vol;
    switch (name) {
      case 'pop': { const f = 700 + Math.random() * 500; this.hit(o, t, f, f * 0.35, 0.07, 0.16 * v, 'triangle'); this.noiseHit(o, t, 0.05, 0.14 * v, 2500); break; }
      case 'bigpop': this.hit(o, t, 420, 120, 0.18, 0.25 * v, 'triangle'); this.noiseHit(o, t, 0.16, 0.22 * v, 1200); break;
      case 'throw': this.noiseHit(o, t, 0.08, 0.09 * v, 3500); this.hit(o, t, 500, 900, 0.06, 0.05 * v, 'sine'); break;
      case 'sniper': this.hit(o, t, 1400, 120, 0.16, 0.2 * v, 'sawtooth'); this.noiseHit(o, t, 0.12, 0.26 * v, 1800); break;
      case 'boomerang': this.hit(o, t, 300, 700, 0.25, 0.08 * v, 'triangle'); this.noiseHit(o, t, 0.2, 0.06 * v, 2000); break;
      case 'lob': this.hit(o, t, 220, 420, 0.12, 0.1 * v, 'sine'); break;
      case 'boom': this.hit(o, t, 160, 38, 0.5, 0.42 * v); this.noiseHit(o, t, 0.42, 0.3 * v, 300); break;
      case 'freeze': this.hit(o, t, 1500, 2600, 0.18, 0.06 * v, 'sine'); this.hit(o, t + 0.03, 2200, 3200, 0.16, 0.05 * v, 'triangle'); this.noiseHit(o, t, 0.15, 0.05 * v, 7000); break;
      case 'zap': this.hit(o, t, 2200, 300, 0.18, 0.1 * v, 'sawtooth'); this.noiseHit(o, t, 0.14, 0.12 * v, 4000); break;
      case 'laser': this.hit(o, t, 1800, 500, 0.25, 0.09 * v, 'sawtooth'); this.hit(o, t, 900, 1400, 0.2, 0.05 * v, 'square'); break;
      case 'magic': this.hit(o, t, 700, 1600, 0.22, 0.07 * v, 'sine'); this.hit(o, t + 0.05, 1100, 2000, 0.18, 0.05 * v, 'triangle'); break;
      case 'splat': this.noiseHit(o, t, 0.16, 0.18 * v, 700); this.hit(o, t, 260, 110, 0.14, 0.12 * v, 'sine'); break;
      case 'coin': this.tone(o, 'square', 1568, t, 0.07, 0.05 * v); this.tone(o, 'square', 2093, t + 0.05, 0.09, 0.05 * v); break;
      case 'unlock': [523, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(o, 'triangle', f, t + i * 0.07, 0.25, 0.1 * v)); break;
      case 'buy': [988, 1318].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.07, 0.14, 0.09 * v)); this.noiseHit(o, t, 0.05, 0.06 * v, 6000); break;
      case 'place': this.hit(o, t, 180, 70, 0.18, 0.3 * v); this.noiseHit(o, t, 0.12, 0.12 * v, 800); [660, 880].forEach((f, i) => this.tone(o, 'triangle', f, t + 0.05 + i * 0.06, 0.12, 0.07 * v)); break;
      case 'upgrade': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.055, 0.18, 0.08 * v)); break;
      case 'sell': [1318, 988, 784].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.07, 0.14, 0.07 * v)); break;
      case 'drop': this.hit(o, t, 1700, 380, 0.4, 0.045 * v, 'sine'); break;
      case 'launch': this.noiseHit(o, t, 0.5, 0.05 * v, 5000); this.hit(o, t, 300, 1100, 0.5, 0.025 * v, 'sine'); break;
      case 'firework': this.hit(o, t, 240, 50, 0.45, 0.16 * v); this.noiseHit(o, t, 0.6, 0.12 * v, 2200); for (let i = 0; i < 7; i++) this.noiseHit(o, t + 0.18 + i * 0.06 + Math.random() * 0.04, 0.03, 0.05 * v, 6500); break;
      case 'leak': this.hit(o, t, 300, 90, 0.3, 0.2 * v, 'sawtooth'); break;
      case 'wave': [392, 523, 659, 784].forEach((f, i) => this.tone(o, 'triangle', f, t + i * 0.09, 0.28, 0.12 * v)); this.hit(o, t, 120, 60, 0.3, 0.25 * v); break;
      case 'waveDone': [784, 988, 1175, 1568].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.06, 0.16, 0.08 * v)); break;
      case 'boss': [220, 196, 220, 165].forEach((f, i) => this.tone(o, 'sawtooth', f, t + i * 0.22, 0.3, 0.1 * v)); this.hit(o, t, 90, 40, 0.8, 0.3 * v); break;
      case 'click': this.hit(o, t, 900, 600, 0.05, 0.1 * v, 'square'); break;
      case 'hover': this.hit(o, t, 1200, 1300, 0.03, 0.025 * v, 'sine'); break;
      case 'select': this.hit(o, t, 600, 1200, 0.12, 0.11 * v, 'triangle'); break;
      case 'error': this.tone(o, 'square', 196, t, 0.16, 0.09 * v); this.tone(o, 'square', 165, t + 0.09, 0.16, 0.08 * v); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.12, 0.3, 0.12 * v)); [262, 330, 392].forEach(f => this.tone(o, 'triangle', f, t + 0.96, 1.2, 0.08 * v)); break;
      case 'defeat': [392, 370, 349, 294].forEach((f, i) => this.tone(o, 'sawtooth', f, t + i * 0.3, 0.42, 0.1 * v)); break;
    }
  }
}
export const MUSIC = {
  lobby: { bpm: 116, scale: 'lydian', root: 62, lead: 'triangle', bass: 'triangle', drums: 'bouncy', seed: 7 },
  select: { bpm: 104, scale: 'major', root: 60, lead: 'sine', bass: 'triangle', drums: 'light', seed: 31 },
  game: { bpm: 124, scale: 'mixolydian', root: 57, lead: 'square', bass: 'triangle', drums: 'funky', seed: 52 },
  boss: { bpm: 136, scale: 'dorian', root: 57, lead: 'sawtooth', bass: 'sawtooth', drums: 'heavy', seed: 88 }
};
