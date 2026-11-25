// All sound is made in the browser (WebAudio), no sound files: the skis gliding on the snow (louder and
// brighter the faster you go, soft and deep in powder), the edges scraping in turns and hockey stops,
// the metal of a rail, wind that grows with speed and in the air, jumps, landings, trick whooshes, menu
// sounds and calm menu music.
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
    const loopNoise = (rate) => { const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true; n.playbackRate.value = rate; n.start(0, Math.random()); return n; };
    // wind: filtered noise, louder and brighter the faster you go
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = 0.6;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    loopNoise(0.7).connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.sGain);
    // the paraglider wing fluttering: low noise, pulsing
    this.flutF = ctx.createBiquadFilter(); this.flutF.type = 'lowpass'; this.flutF.frequency.value = 420;
    this.flutG = ctx.createGain(); this.flutG.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lfoG = ctx.createGain(); lfoG.gain.value = 0; lfo.connect(lfoG); lfoG.connect(this.flutG.gain); lfo.start(); this.lfoG = lfoG;
    loopNoise(0.5).connect(this.flutF); this.flutF.connect(this.flutG); this.flutG.connect(this.sGain);
    // the lift motor: a low hum
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 62; const humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 240;
    this.humG = ctx.createGain(); this.humG.gain.value = 0; hum.connect(humF); humF.connect(this.humG); this.humG.connect(this.sGain); hum.start();
    // snow crunching under you when slow
    this.crunchF = ctx.createBiquadFilter(); this.crunchF.type = 'highpass'; this.crunchF.frequency.value = 900;
    this.crunchG = ctx.createGain(); this.crunchG.gain.value = 0;
    loopNoise(0.9).connect(this.crunchF); this.crunchF.connect(this.crunchG); this.crunchG.connect(this.sGain);
    this.varioT = 0;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = 1.3; s.start();
    this.carveF = ctx.createBiquadFilter(); this.carveF.type = 'bandpass'; this.carveF.frequency.value = 2600; this.carveF.Q.value = 0.8;
    this.carveG = ctx.createGain(); this.carveG.gain.value = 0;
    s.connect(this.carveF); this.carveF.connect(this.carveG); this.carveG.connect(this.sGain);
    // the skis gliding: a soft hiss that grows with speed
    this.glideF = ctx.createBiquadFilter(); this.glideF.type = 'lowpass'; this.glideF.frequency.value = 900; this.glideF.Q.value = 0.4;
    this.glideG = ctx.createGain(); this.glideG.gain.value = 0;
    loopNoise(1.1).connect(this.glideF); this.glideF.connect(this.glideG); this.glideG.connect(this.sGain);
    // sliding a rail: a metallic ring
    const rail = ctx.createOscillator(); rail.type = 'sawtooth'; rail.frequency.value = 410; const railF = ctx.createBiquadFilter(); railF.type = 'bandpass'; railF.frequency.value = 2400; railF.Q.value = 6;
    this.railG = ctx.createGain(); this.railG.gain.value = 0; rail.connect(railF); railF.connect(this.railG); this.railG.connect(this.sGain); rail.start();
    const railN = ctx.createBiquadFilter(); railN.type = 'highpass'; railN.frequency.value = 3000; loopNoise(1.4).connect(railN); railN.connect(this.railG);
  }
  // called every frame with what the rider is doing
  ride(speed, grounded, carve, brake, powder, rail, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, on = active && grounded && !rail ? 1 : 0, s = Math.min(1, speed / 30);
    const k = Math.max(0, carve - 0.35) * s * 0.3 + brake * Math.min(1, speed / 8) * 0.4;
    this.carveG.gain.setTargetAtTime(on * Math.min(0.42, k) * (1 - powder * 0.6), t, 0.05);
    this.carveF.frequency.setTargetAtTime(3000 - powder * 1600, t, 0.2);
    this.glideG.gain.setTargetAtTime(on * Math.min(0.16, speed / 160) * (1 + powder * 0.6), t, 0.1);
    this.glideF.frequency.setTargetAtTime(500 + speed * 45 - powder * 400, t, 0.2);
    this.railG.gain.setTargetAtTime(active && rail ? 0.05 + Math.min(0.06, speed / 300) : 0, t, 0.04);
    // a soft crunch when riding slowly on the snow
    this.crunchG.gain.setTargetAtTime(on * (speed > 0.4 ? 0.05 * (1 - Math.min(1, speed / 10)) + 0.012 : 0), t, 0.08);
  }
  // the air around you: kind 'ground' | 'wingsuit' | 'para' | 'lift' | 'off'
  air(speed, kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    let wind = 0, f = 500, flut = 0, hum = 0;
    if (kind === 'ground') { wind = Math.min(0.3, Math.max(0, speed - 8) / 80); f = 300 + speed * 18; }
    else if (kind === 'air') { wind = Math.min(0.36, 0.05 + speed / 90); f = 420 + speed * 16; }
    else if (kind === 'wingsuit') { wind = Math.min(0.55, 0.1 + speed / 140); f = 380 + speed * 14; }
    else if (kind === 'para') { wind = 0.05 + speed * 0.004; f = 320; flut = 0.07; }
    else if (kind === 'lift') { wind = 0.03; f = 260; hum = 0.08; }
    this.windG.gain.setTargetAtTime(wind, t, 0.25); this.windF.frequency.setTargetAtTime(f, t, 0.3);
    this.flutG.gain.setTargetAtTime(flut, t, 0.3); this.lfoG.gain.setTargetAtTime(flut * 0.9, t, 0.3);
    this.humG.gain.setTargetAtTime(hum, t, 0.4);
    if (kind !== 'ground') this.crunchG.gain.setTargetAtTime(0, t, 0.05);
    if (kind !== 'ground') this.carveG.gain.setTargetAtTime(0, t, 0.05);
  }
  // a paraglider vario: beeps faster and higher the faster you climb
  vario(climb, dt) {
    if (!this.ctx || climb < 0.35) { this.varioT = 0; return; }
    this.varioT -= dt;
    if (this.varioT <= 0) { this.varioT = Math.max(0.12, 0.55 - climb * 0.1); this.tone(620 + climb * 140, 0.05, 0.09, 'square'); }
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
      case 'hover': this.tone(1400, 0.025, 0.04, 'sine'); break;
      case 'back': this.tone(660, 0.07, 0.08, 'triangle', 0, 0.7); break;
      case 'ring': this.tone(988, 0.12, 0.2, 'sine'); this.tone(1480, 0.1, 0.28, 'sine', 0.06); this.noiseHit(3000, 1, 0.08, 0.2, 'bandpass'); break;
      case 'miss': this.tone(240, 0.1, 0.25, 'square', 0, 0.8); break;
      case 'combo': this.tone(880 * Math.pow(2, Math.min(12, k) / 12), 0.09, 0.15, 'triangle'); break;
      case 'comboLost': this.tone(330, 0.12, 0.35, 'sawtooth', 0, 0.5); break;
      case 'cash': [0, 7, 12].forEach((n, i) => this.tone(659 * Math.pow(2, n / 12), 0.08, 0.2, 'triangle', i * 0.05)); break;
      case 'discover': [0, 5, 9, 12].forEach((n, i) => this.tone(587 * Math.pow(2, n / 12), 0.08, 0.35, 'sine', i * 0.11)); break;
      case 'levelup': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(392 * Math.pow(2, n / 12), 0.11, 0.4, 'triangle', i * 0.08)); this.noiseHit(5000, 0.7, 0.06, 0.9, 'highpass', 0.5); break;
      case 'medal': [0, 7, 12, 16].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.12, 0.5, 'triangle', i * 0.12)); break;
      case 'canopy': this.noiseHit(700, 0.6, 0.35, 0.5); this.noiseHit(1800, 1.2, 0.12, 0.3, 'bandpass', 0.15); break;
      case 'crash': this.noiseHit(180, 0.4, 0.7, 0.6); this.noiseHit(900, 0.8, 0.3, 0.4, 'bandpass', 0.05); this.tone(70, 0.3, 0.4, 'sine', 0, 0.5); break;
      case 'whoosh': this.noiseHit(1200, 0.7, 0.18, 0.45, 'bandpass'); break;
      case 'spin': this.noiseHit(900 + k * 500, 1.2, 0.07, 0.22, 'bandpass'); break;
      case 'pop': this.noiseHit(2400, 0.9, 0.14, 0.12, 'bandpass'); this.noiseHit(400, 0.7, 0.18 + k * 0.12, 0.18); break;
      case 'charge': this.tone(180 + k * 260, 0.025, 0.06, 'triangle'); break;
      case 'perfect': [0, 7, 12, 19].forEach((n, i) => this.tone(659 * Math.pow(2, n / 12), 0.09, 0.3, 'triangle', i * 0.05)); this.noiseHit(6000, 0.7, 0.05, 0.5, 'highpass', 0.15); break;
      case 'railOn': this.tone(1240, 0.08, 0.2, 'triangle'); this.noiseHit(3500, 2, 0.12, 0.12, 'bandpass'); break;
      case 'powderLand': this.noiseHit(260, 0.5, 0.4, 0.6); this.noiseHit(1100, 0.4, 0.12, 0.5, 'bandpass', 0.05); break;
      case 'clunk': this.tone(110, 0.12, 0.12, 'square', 0, 0.6); this.noiseHit(800, 2, 0.06, 0.1, 'bandpass', 0.02); break;
      case 'unlock': this.tone(1046, 0.09, 0.15, 'triangle'); this.tone(1568, 0.09, 0.3, 'triangle', 0.1); break;
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
