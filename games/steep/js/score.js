// Points. Every landed trick (and every rail) goes into the running combo; the combo's multiplier
// grows with every trick in it (1x, 1.5x, 2x, ... up to 10x). Land and keep going: a new jump or rail
// within a few seconds keeps the combo alive. When the time runs out the combo is banked into your
// score; a crash loses it.
// Style: the same trick twice in one combo is worth less each time, a perfect landing is worth more.
export const LANDING = { perfect: { k: 1.5, label: 'PERFECT LANDING' }, clean: { k: 1, label: 'CLEAN LANDING' }, sketchy: { k: 0.5, label: 'SKETCHY LANDING' }, crash: { k: 0, label: 'BAIL' } };

export class Score {
  constructor() { this.total = 0; this.best = 0; this.reset(); this.bestTrick = null; }
  reset() { this.chain = []; this.pts = 0; this.window = 0; this.windowMax = 3.2; }
  get mult() { return Math.min(10, 1 + 0.5 * Math.max(0, this.chain.length - 1)); }
  get open() { return this.chain.length > 0; }
  // a trick landed: returns what it was worth (before the multiplier)
  add(name, base, quality = 'clean', extra = {}) {
    if (!name || base <= 0) return 0;
    const rep = this.chain.filter(c => c.name === name).length;
    let p = base * LANDING[quality].k * Math.pow(0.55, rep);
    if (extra.switch) p *= 1.1;
    p = Math.round(p / 10) * 10;
    this.chain.push({ name, p, quality });
    this.pts += p;
    this.window = this.windowMax;
    if (!this.bestTrick || base > this.bestTrick.base) this.bestTrick = { name, base };
    return p;
  }
  // the air or a rail started: the combo waits for you
  hold() { if (this.open) this.window = this.windowMax; }
  // returns the banked amount when the combo ends by itself
  update(dt, grounded) {
    if (!this.open) return 0;
    if (grounded) this.window -= dt;
    if (this.window <= 0) return this.bank();
    return 0;
  }
  bank() {
    const v = Math.round(this.pts * this.mult);
    this.total += v; this.best = Math.max(this.best, v);
    this.reset();
    return v;
  }
  lose() { const lost = this.pts; this.reset(); return lost; }
}
