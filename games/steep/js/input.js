// Keyboard (and touch) turned into one set of controls.
//   W forward / S backward (brake when moving), A / D turn
//   SPACE hold to charge a jump, let go to jump. Hold W (frontflip), S (backflip), Q / E (side flip)
//   or A / D (spin) as you let go to throw a trick. In the air: A / D spin, W / S flip, Q / E side flip,
//   SPACE grab.
// Opposite keys (W+S or A+D) never fight: the one pressed last wins.
// Touch: a joystick on the left (it also does the tricks in the air), a jump button on the right
// (hold, let go; in the air it grabs), and two small side-flip buttons.
const KEYS = { KeyW: 'w', ArrowUp: 'w', KeyS: 's', ArrowDown: 's', KeyA: 'a', ArrowLeft: 'a', KeyD: 'd', ArrowRight: 'd', Space: 'jump', KeyQ: 'q', KeyE: 'e' };

export class Input {
  constructor(app) {
    this.app = app;
    this.down = {}; this.order = { ws: null, ad: null, qe: null };
    this.joy = { x: 0, y: 0, id: null }; this.jumpTouch = null; this.qeTouch = 0;
    this.enabled = false;
    addEventListener('keydown', e => this.key(e, true));
    addEventListener('keyup', e => this.key(e, false));
    addEventListener('blur', () => this.reset());
    this.wireTouch();
  }
  key(e, on) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    const k = KEYS[e.code];
    if (k) {
      if (this.enabled) e.preventDefault();
      const pair = k === 'w' || k === 's' ? 'ws' : k === 'a' || k === 'd' ? 'ad' : k === 'q' || k === 'e' ? 'qe' : null;
      if (on && !this.down[k] && pair) this.order[pair] = k;
      this.down[k] = on;
      if (!on && pair && this.order[pair] === k) {
        const other = { w: 's', s: 'w', a: 'd', d: 'a', q: 'e', e: 'q' }[k];
        this.order[pair] = this.down[other] ? other : null;
      }
    }
    if (on && !e.repeat && this.onPress) this.onPress(e.code, e);
  }
  state() {
    const o = this.order;
    let fwd = o.ws === 'w' ? 1 : o.ws === 's' ? -1 : 0, steer = o.ad === 'd' ? 1 : o.ad === 'a' ? -1 : 0;
    let roll = o.qe === 'e' ? 1 : o.qe === 'q' ? -1 : this.qeTouch;
    if (this.joy.id !== null) {
      if (Math.abs(this.joy.y) > 0.3) fwd = -Math.sign(this.joy.y) * Math.min(1, Math.abs(this.joy.y) * 1.3);
      if (Math.abs(this.joy.x) > 0.15) steer = Math.max(-1, Math.min(1, this.joy.x * 1.3));
    }
    const jump = !!this.down.jump || this.jumpTouch !== null;
    // the tricks: W frontflip (+), S backflip (-), A spin left (+), D spin right (-), E roll right (+)
    return { fwd, steer, jump, flip: Math.abs(fwd) > 0.5 ? Math.sign(fwd) : 0, spin: Math.abs(steer) > 0.5 ? -Math.sign(steer) : 0, roll, grab: jump };
  }
  reset() { this.down = {}; this.order = { ws: null, ad: null, qe: null }; this.jumpTouch = null; this.qeTouch = 0; this.joy.id = null; this.joy.x = this.joy.y = 0; const k = document.querySelector('#joy .knob'); if (k) k.style.transform = ''; }

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
    act.addEventListener('pointerdown', e => { e.preventDefault(); act.setPointerCapture(e.pointerId); this.app.touchSeen(); if (this.jumpTouch === null) this.jumpTouch = e.pointerId; act.classList.add('on'); });
    const actEnd = e => { if (this.jumpTouch === e.pointerId) { this.jumpTouch = null; act.classList.remove('on'); } };
    act.addEventListener('pointerup', actEnd); act.addEventListener('pointercancel', actEnd);
    for (const [id, v] of [['tq', -1], ['te', 1]]) {
      const b = $(id); if (!b) continue;
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); this.qeTouch = v; b.classList.add('on'); });
      const end = () => { if (this.qeTouch === v) this.qeTouch = 0; b.classList.remove('on'); };
      b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
    }
    // drag the picture to look around
    const cv = $('gl');
    cv.addEventListener('pointerdown', e => { if (!this.enabled) return; this.camDrag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
    addEventListener('pointermove', e => { const d = this.camDrag; if (!d || d.id !== e.pointerId) return; this.app.cam && this.app.cam.drag(e.clientX - d.x, e.clientY - d.y); d.x = e.clientX; d.y = e.clientY; });
    const camEnd = e => { if (this.camDrag && this.camDrag.id === e.pointerId) this.camDrag = null; };
    addEventListener('pointerup', camEnd); addEventListener('pointercancel', camEnd);
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', e => { if (this.enabled) e.preventDefault(); }, { passive: false });
  }
}
