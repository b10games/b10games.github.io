// Music and sound effects, all made in the browser with WebAudio (no files).
// Songs are made from a tempo, scale, instruments, drum style and seed. Disasters also get looping
// sounds (wind, rain, rumble) and sounds that get quieter the further away they happen.
import { rng } from './engine.js';

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10]
};
const PROGS = [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 4], [5, 3, 0, 4], [0, 2, 3, 4]];

export class Audio {
  constructor() {
    this.ctx = null; this.music = null; this.vol = { music: 0.55, sfx: 0.8 };
    try { const v = JSON.parse(localStorage.getItem('bd-vol')); if (v) this.vol = v; } catch (e) {}
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
    try { localStorage.setItem('bd-vol', JSON.stringify(this.vol)); } catch (e) {}
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
  // where the listener is (the camera), for sounds that fade with distance
  setListener(p) { this.lp = p; }
  sfxAt(name, p, range = 90) {
    if (!this.lp) return this.sfx(name);
    const d = Math.hypot(p.x - this.lp.x, p.y - this.lp.y, p.z - this.lp.z), k = Math.max(0, 1 - d / range);
    if (k <= 0.02) return;
    // far thunder comes a moment later
    const delay = name === 'thunder' ? Math.min(1.2, d / 340) : 0;
    this.sfx(name, k, delay);
  }
  sfx(name, vol = 1, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01 + delay;
    let o = this.sGain;
    if (vol !== 1) { o = this.ctx.createGain(); o.gain.value = vol; o.connect(this.sGain); setTimeout(() => { try { o.disconnect(); } catch (e) {} }, 4000 + delay * 1000); }
    switch (name) {
      case 'jump': this.hit(o, t, 300, 620, 0.14, 0.16, 'square'); break;
      case 'land': this.hit(o, t, 120, 60, 0.12, 0.3); break;
      case 'bounce': this.hit(o, t, 200, 900, 0.3, 0.25, 'sine'); this.hit(o, t + 0.05, 300, 1100, 0.25, 0.12, 'triangle'); break;
      case 'hit': this.hit(o, t, 420, 90, 0.25, 0.3, 'square'); this.noiseHit(o, t, 0.15, 0.25, 2000); break;
      case 'ouch': this.hit(o, t, 700, 300, 0.18, 0.18, 'triangle'); this.hit(o, t + 0.08, 500, 200, 0.2, 0.12, 'triangle'); break;
      case 'splash': this.noiseHit(o, t, 0.5, 0.35, 600); this.hit(o, t, 400, 120, 0.25, 0.1, 'sine'); break;
      case 'swim': this.noiseHit(o, t, 0.15, 0.08, 1200); break;
      case 'click': this.hit(o, t, 900, 600, 0.05, 0.12, 'square'); break;
      case 'buy': [784, 988, 1318].forEach((f, i) => this.tone(o, 'triangle', f, t + i * 0.07, 0.2, 0.16)); break;
      case 'error': this.tone(o, 'square', 180, t, 0.25, 0.12); break;
      case 'beep': this.tone(o, 'square', 660, t, 0.18, 0.18); break;
      case 'go': this.tone(o, 'square', 990, t, 0.4, 0.2); this.tone(o, 'triangle', 1320, t, 0.4, 0.12); break;
      case 'siren': for (let i = 0; i < 4; i++) { this.hit(o, t + i * 0.55, 600, 950, 0.27, 0.13, 'sawtooth'); this.hit(o, t + i * 0.55 + 0.27, 950, 600, 0.27, 0.13, 'sawtooth'); } break;
      case 'survive': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.11, 0.28, 0.13)); break;
      case 'out': [392, 370, 349, 311].forEach((f, i) => this.tone(o, 'sawtooth', f, t + i * 0.2, 0.3, 0.12)); this.hit(o, t, 800, 100, 0.6, 0.15, 'sine'); break;
      case 'boom': this.hit(o, t, 120, 30, 0.6, 0.6); this.noiseHit(o, t, 0.7, 0.45, 200); break;
      case 'bigboom': this.hit(o, t, 90, 22, 1.0, 0.75); this.noiseHit(o, t, 1.2, 0.6, 120); break;
      case 'crash': this.noiseHit(o, t, 0.35, 0.4, 900); this.hit(o, t, 200, 60, 0.3, 0.3, 'square'); break;
      case 'jolt': this.hit(o, t, 70, 30, 0.9, 0.7); this.noiseHit(o, t, 0.8, 0.4, 80); break;
      case 'thunder': this.noiseHit(o, t, 1.6, 0.7, 60); this.hit(o, t, 100, 30, 1.2, 0.5); this.noiseHit(o, t, 0.12, 0.6, 3000); break;
      case 'wave': this.noiseHit(o, t, 2.5, 0.5, 150); break;
      case 'whoosh': this.noiseHit(o, t, 0.5, 0.3, 1500); this.hit(o, t, 300, 900, 0.4, 0.08, 'sine'); break;
      case 'sizzle': this.noiseHit(o, t, 0.4, 0.2, 4000); break;
      case 'hot': this.hit(o, t, 500, 1400, 0.25, 0.2, 'square'); this.noiseHit(o, t, 0.3, 0.25, 3000); break;
      case 'coin': [1318, 1760].forEach((f, i) => this.tone(o, 'square', f, t + i * 0.06, 0.12, 0.1)); break;
      case 'join': [784, 988, 1175].forEach((f, i) => this.tone(o, 'triangle', f, t + i * 0.07, 0.2, 0.14)); break;
      case 'tick': this.tone(o, 'square', 1200, t, 0.05, 0.08); break;
    }
  }
  // a looping noise (wind, rain, rumble); set(volume 0..1) and stop()
  loop(kind, vol = 0.5) {
    const none = { set() {}, stop() {} };
    if (!this.ctx) return none;
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; s.loop = true;
    f.type = kind === 'rumble' ? 'lowpass' : kind === 'rain' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'rumble' ? 140 : kind === 'rain' ? 3000 : 500; f.Q.value = kind === 'wind' ? 0.8 : 0.5;
    const max = kind === 'rumble' ? 0.9 : kind === 'rain' ? 0.18 : 0.45;
    g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.sGain); s.start();
    let lfoT = null;
    if (kind === 'wind') lfoT = setInterval(() => { try { f.frequency.setTargetAtTime(350 + Math.random() * 500, ctx.currentTime, 0.6); } catch (e) {} }, 700);
    const ctl = {
      set: v => { try { g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * max, ctx.currentTime, 0.25); } catch (e) {} },
      stop: () => { clearInterval(lfoT); try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); } catch (e) {} setTimeout(() => { try { s.stop(); s.disconnect(); } catch (e) {} }, 1500); }
    };
    ctl.set(vol);
    return ctl;
  }
}
