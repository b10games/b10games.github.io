// Keyboard and touch, turned into one set of controls.
// On the snow: W/S speed up and slow down, A/D turn, hold SPACE to charge a jump and let go to jump.
// In the air: W frontflip, S backflip, A/D spins, and two keys together for the diagonal flips.
// Opposite keys (W+S or A+D) never fight: the one pressed last wins.
//
// Touch: a joystick on the left, a big jump button on the right (hold, then let go). In the air the jump
// button turns into a trick pad with four directions; two fingers (or one thumb between two buttons)
// make the diagonal flips.
const KEYS = { KeyW: 'w', ArrowUp: 'w', KeyS: 's', ArrowDown: 's', KeyA: 'a', ArrowLeft: 'a', KeyD: 'd', ArrowRight: 'd', Space: 'jump' };

export class Input {
  constructor(app) {
    this.app = app;
    this.down = {}; this.order = { ws: null, ad: null };
    this.joy = { x: 0, y: 0, id: null }; this.jumpTouch = null; this.pad = new Map(); this.camDrag = null;
    this.air = false; this.enabled = false;
    addEventListener('keydown', e => this.key(e, true));
    addEventListener('keyup', e => this.key(e, false));
    addEventListener('blur', () => { this.down = {}; this.order = { ws: null, ad: null }; });
    this.wireTouch();
  }
  key(e, on) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = KEYS[e.code];
    if (k) {
      if (this.enabled) e.preventDefault();
      if (on && !this.down[k]) {
        if (k === 'w' || k === 's') this.order.ws = k;
        if (k === 'a' || k === 'd') this.order.ad = k;
      }
      this.down[k] = on;
      if (!on) {
        if ((k === 'w' || k === 's') && this.order.ws === k) this.order.ws = this.down[k === 'w' ? 's' : 'w'] ? (k === 'w' ? 's' : 'w') : null;
        if ((k === 'a' || k === 'd') && this.order.ad === k) this.order.ad = this.down[k === 'a' ? 'd' : 'a'] ? (k === 'a' ? 'd' : 'a') : null;
      }
      return;
    }
    if (on && !e.repeat && this.onPress) this.onPress(e.code, e);
  }
  // one set of numbers for the rider
  state() {
    const ws = this.order.ws, ad = this.order.ad;
    let fwd = ws === 'w' ? 1 : ws === 's' ? -1 : 0, steer = ad === 'd' ? 1 : ad === 'a' ? -1 : 0;
    let flip = fwd, spin = steer;
    // the joystick
    if (this.joy.id !== null) {
      if (Math.abs(this.joy.y) > 0.25) fwd = -this.joy.y;
      if (Math.abs(this.joy.x) > 0.12) steer = this.joy.x;
    }
    // the trick pad: every finger on it adds its direction
    if (this.pad.size) {
      let f = 0, s = 0;
      for (const d of this.pad.values()) { if (d.f) f = d.f; if (d.s) s = d.s; }
      flip = f; spin = s;
    }
    return { fwd, steer, jump: !!this.down.jump || this.jumpTouch !== null, flip, spin };
  }
  reset() { this.down = {}; this.order = { ws: null, ad: null }; this.pad.clear(); this.jumpTouch = null; this.joy.id = null; this.joy.x = this.joy.y = 0; this.paint(); }

  // ---------- touch ----------
  wireTouch() {
    const $ = id => document.getElementById(id);
    const joy = $('joy'), act = $('act');
    if (!joy || !act) return;
    const knob = joy.querySelector('.knob');
    const joyMove = (e) => {
      const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width * 0.42;
      let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      this.joy.x = dx; this.joy.y = dy;
      knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
    };
    joy.addEventListener('pointerdown', e => { e.preventDefault(); this.joy.id = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); this.app.touchSeen(); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === this.joy.id) joyMove(e); });
    const joyEnd = e => { if (e.pointerId !== this.joy.id) return; this.joy.id = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
    // the jump button / trick pad
    const padDir = (e) => {
      const r = act.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy);
      if (d < r.width * 0.14) return { f: 0, s: 0 };
      const a = Math.atan2(-dy, dx) * 180 / Math.PI;          // 0 = right, 90 = up
      const sector = Math.round(((a + 360) % 360) / 45) % 8;  // 8 directions
      return [{ f: 0, s: 1 }, { f: 1, s: 1 }, { f: 1, s: 0 }, { f: 1, s: -1 }, { f: 0, s: -1 }, { f: -1, s: -1 }, { f: -1, s: 0 }, { f: -1, s: 1 }][sector];
    };
    act.addEventListener('pointerdown', e => {
      e.preventDefault(); act.setPointerCapture(e.pointerId); this.app.touchSeen();
      if (this.air) { this.pad.set(e.pointerId, padDir(e)); this.paint(); }
      else if (this.jumpTouch === null) this.jumpTouch = e.pointerId;
    });
    act.addEventListener('pointermove', e => { if (this.pad.has(e.pointerId)) { this.pad.set(e.pointerId, padDir(e)); this.paint(); } });
    const actEnd = e => { if (this.jumpTouch === e.pointerId) this.jumpTouch = null; if (this.pad.delete(e.pointerId)) this.paint(); };
    act.addEventListener('pointerup', actEnd); act.addEventListener('pointercancel', actEnd);
    this.actEl = act;
    // drag anywhere else to look around
    const cv = $('gl');
    cv.addEventListener('pointerdown', e => { if (!this.enabled) return; this.camDrag = { id: e.pointerId, x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { const d = this.camDrag; if (!d || d.id !== e.pointerId) return; this.app.cam && this.app.cam.drag(e.clientX - d.x, e.clientY - d.y); d.x = e.clientX; d.y = e.clientY; });
    const camEnd = e => { if (this.camDrag && this.camDrag.id === e.pointerId) this.camDrag = null; };
    cv.addEventListener('pointerup', camEnd); cv.addEventListener('pointercancel', camEnd);
    // no zooming, no text selection, no long-press menus on the iPad
    for (const ev of ['gesturestart', 'gesturechange', 'contextmenu']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', e => { if (this.enabled) e.preventDefault(); }, { passive: false });
  }
  // light up the trick buttons that are held
  paint() {
    if (!this.actEl) return;
    let f = 0, s = 0; for (const d of this.pad.values()) { if (d.f) f = d.f; if (d.s) s = d.s; }
    this.actEl.querySelector('.tb.front').classList.toggle('on', f > 0);
    this.actEl.querySelector('.tb.back').classList.toggle('on', f < 0);
    this.actEl.querySelector('.tb.left').classList.toggle('on', s < 0);
    this.actEl.querySelector('.tb.right').classList.toggle('on', s > 0);
  }
  setAir(air) {
    if (this.air === air) return;
    this.air = air;
    if (this.actEl) this.actEl.classList.toggle('air', air);
    if (!air) { this.pad.clear(); this.paint(); }
  }
}
