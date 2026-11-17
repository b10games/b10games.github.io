// All sound is made in the browser (WebAudio), no sound files: snow scraping in hard turns, jumps, landings,
// menu clicks and a calm lobby tune.
export class Sound {
  constructor() { this.ctx = null; this.vol = { music: 0.5, sfx: 0.8 }; this.music = null; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; const ctx = this.ctx = new C();
      this.master = ctx.createGain(); this.master.connect(ctx.destination);
      this.mGain = ctx.createGain(); this.mGain.connect(this.master);
      this.sGain = ctx.createGain(); this.sGain.connect(this.master);
      this.setVolume(this.vol.music, this.vol.sfx);
      const len = ctx.sampleRate * 2; this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0); let b = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
      this.loops();
      if (this.wantMusic) this.playMusic();
    } catch (e) { this.ctx = null; }
  }
  setVolume(music, sfx) {
    this.vol.music = music; this.vol.sfx = sfx;
    if (!this.ctx) return;
    this.mGain.gain.value = music * 0.6; this.sGain.gain.value = sfx;
  }
  // the only sound that follows the riding: a short scrape of snow when you turn hard or brake
  // (no wind and no constant whoosh while riding down)
  loops() {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = 1.3; s.start();
    this.carveF = ctx.createBiquadFilter(); this.carveF.type = 'bandpass'; this.carveF.frequency.value = 2600; this.carveF.Q.value = 0.8;
    this.carveG = ctx.createGain(); this.carveG.gain.value = 0;
    s.connect(this.carveF); this.carveF.connect(this.carveG); this.carveG.connect(this.sGain);
  }
  // called every frame with what the rider is doing
  ride(speed, grounded, carve, brake, skis, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, on = active && grounded ? 1 : 0, s = Math.min(1, speed / 30);
    const k = Math.max(0, carve - 0.35) * s * 0.3 + brake * Math.min(1, speed / 8) * 0.35;
    this.carveG.gain.setTargetAtTime(on * Math.min(0.4, k), t, 0.05);
    this.carveF.frequency.setTargetAtTime(skis ? 3200 : 2300, t, 0.2);
  }
  // ---------- one-shots ----------
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  noiseHit(freq, q, peak, dur, type = 'lowpass', delay = 0) {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain();
    s.connect(f); f.connect(g); g.connect(this.sGain); this.env(g, t, 0.01, peak, dur); s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  tone(freq, peak, dur, type = 'sine', delay = 0, slide = 0) {
    const ctx = this.ctx; if (!ctx) return; const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain(); o.connect(g); g.connect(this.sGain); this.env(g, t, 0.01, peak, dur); o.start(t); o.stop(t + dur + 0.1);
  }
  sfx(name, k = 1) {
    if (!this.ctx) return;
    switch (name) {
      case 'click': this.tone(880, 0.08, 0.06, 'triangle'); this.tone(1320, 0.05, 0.05, 'sine', 0.03); break;
      case 'select': this.tone(660, 0.08, 0.1, 'triangle'); this.tone(990, 0.07, 0.12, 'triangle', 0.06); break;
      case 'jump': this.noiseHit(1800, 0.8, 0.12 + k * 0.1, 0.25, 'bandpass'); this.tone(220, 0.05, 0.15, 'sine', 0, 1.6); break;
      case 'land': this.noiseHit(500, 0.6, Math.min(0.55, 0.15 + k * 0.4), 0.28); this.tone(90, Math.min(0.4, 0.1 + k * 0.3), 0.2, 'sine', 0, 0.6); break;
      case 'trick': [0, 4, 7, 12].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.09, 0.22, 'triangle', i * 0.06)); break;
      case 'big': [0, 4, 7, 12, 16].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.1, 0.3, 'triangle', i * 0.07)); break;
      case 'grab': this.noiseHit(2600, 1.2, 0.07, 0.12, 'bandpass'); this.tone(330, 0.04, 0.08, 'triangle', 0, 1.3); break;
      case 'bail': this.noiseHit(300, 0.5, 0.5, 0.5); this.noiseHit(1200, 0.8, 0.2, 0.3, 'bandpass', 0.1); break;
      case 'gate': this.tone(1046, 0.12, 0.25, 'sine'); this.tone(1568, 0.08, 0.3, 'sine', 0.08); break;
      case 'beep': this.tone(660, 0.14, 0.15, 'square'); break;
      case 'go': this.tone(1320, 0.16, 0.4, 'square'); break;
      case 'finish': [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.1, 0.25, 'triangle', i * 0.09)); break;
      case 'lift': this.tone(140, 0.12, 0.3, 'sawtooth', 0, 0.8); this.noiseHit(2000, 2, 0.08, 0.15, 'bandpass', 0.2); break;
      case 'error': this.tone(200, 0.12, 0.2, 'square', 0, 0.7); break;
      case 'ready': this.tone(784, 0.1, 0.12, 'triangle'); this.tone(1175, 0.1, 0.2, 'triangle', 0.08); break;
    }
  }
  // ---------- calm lobby music: soft chords, a bass and a little melody ----------
  playMusic() {
    this.wantMusic = true;
    if (!this.ctx || this.music) return;
    const ctx = this.ctx, out = ctx.createGain(); out.gain.value = 0; out.connect(this.mGain);
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    const verb = ctx.createDelay(); verb.delayTime.value = 0.32; const fb = ctx.createGain(); fb.gain.value = 0.35; const vf = ctx.createBiquadFilter(); vf.type = 'lowpass'; vf.frequency.value = 2200;
    verb.connect(vf); vf.connect(fb); fb.connect(verb); vf.connect(out);
    const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]];
    const mel = [76, 74, 72, 74, 76, 79, 76, 74, 72, 71, 72, 74, 72, 69, 67, 69];
    const bpm = 84, beat = 60 / bpm;
    const m = this.music = { out, next: ctx.currentTime + 0.2, i: 0, timer: 0 };
    const hz = n => 440 * Math.pow(2, (n - 69) / 12);
    const note = (n, t, d, type, peak, dest) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(n); const g = ctx.createGain(); o.connect(g); g.connect(dest); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.4, d * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.start(t); o.stop(t + d + 0.05); };
    const sched = () => {
      while (m.next < ctx.currentTime + 0.4) {
        const bar = Math.floor(m.i / 4), b = m.i % 4, ch = chords[bar % 4], t = m.next;
        if (b === 0) { for (const n of ch) note(n, t, beat * 4, 'triangle', 0.035, out); note(ch[0] - 12, t, beat * 1.8, 'sine', 0.12, out); }
        if (b === 2) note(ch[0] - 12, t, beat * 1.5, 'sine', 0.09, out);
        const mn = mel[(m.i * 2) % mel.length];
        if ((m.i + bar) % 3 !== 1) note(mn, t + beat * 0.5, beat * 0.9, 'sine', 0.05, verb);
        // soft hi-hat
        const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = ctx.createGain();
        s.connect(f); f.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t + beat * 0.5); g.gain.exponentialRampToValueAtTime(0.03, t + beat * 0.5 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.5 + 0.06); s.start(t + beat * 0.5, Math.random()); s.stop(t + beat * 0.5 + 0.1);
        m.next += beat; m.i++;
      }
    };
    sched(); m.timer = setInterval(sched, 120);
  }
  stopMusic() {
    this.wantMusic = false;
    const m = this.music; if (!m) return; this.music = null;
    clearInterval(m.timer);
    const t = this.ctx.currentTime; m.out.gain.cancelScheduledValues(t); m.out.gain.setValueAtTime(m.out.gain.value, t); m.out.gain.linearRampToValueAtTime(0, t + 1.2);
    setTimeout(() => m.out.disconnect(), 1500);
  }
}
