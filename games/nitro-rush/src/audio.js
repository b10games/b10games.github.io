export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.muted = false;
    this.started = false;
  }

  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.started = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.32;
  }

  tone(freq, dur = 0.08, type = "sine", gain = 0.12, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  click() {
    this.tone(740, 0.05, "square", 0.04);
  }

  beep(go = false) {
    if (go) this.tone(880, 0.18, "square", 0.1);
    else this.tone(520, 0.12, "square", 0.08);
  }

  buy() {
    this.tone(660, 0.07, "sine", 0.08);
    setTimeout(() => this.tone(990, 0.1, "sine", 0.08), 70);
  }

  reward() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.16, "triangle", 0.08), i * 90);
    });
  }

  hit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  ensureEngine() {
    if (!this.ctx || this.engine) return;
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o1.type = "sawtooth";
    o2.type = "square";
    o2.detune.value = 8;
    filter.type = "lowpass";
    filter.frequency.value = 280;
    g.gain.value = 0.0001;
    o1.connect(filter);
    o2.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    o1.start();
    o2.start();
    this.engine = { o1, o2, filter, g };
  }

  engineUpdate(speed, maxSpeed, throttle, nitro) {
    this.ensureEngine();
    if (!this.engine || !this.ctx) return;
    const rpm = Math.min(1.15, Math.abs(speed) / Math.max(8, maxSpeed));
    const gearFrac = (rpm * 4.2) % 1;
    const freq = 48 + gearFrac * 70 + rpm * 28 + (throttle ? 16 : 0) + (nitro ? 22 : 0);
    const t = this.ctx.currentTime;
    this.engine.o1.frequency.setTargetAtTime(freq, t, 0.05);
    this.engine.o2.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(220 + rpm * 1600 + (nitro ? 600 : 0), t, 0.08);
    const vol = 0.015 + rpm * 0.05 + (throttle ? 0.02 : 0) + (nitro ? 0.02 : 0);
    this.engine.g.gain.setTargetAtTime(vol, t, 0.05);
  }

  engineStop() {
    if (!this.engine || !this.ctx) return;
    this.engine.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
  }
}
