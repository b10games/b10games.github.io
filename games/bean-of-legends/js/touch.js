// Touch controls (iPad and other touch screens).
//  - left side: a joystick that appears where your thumb lands; your bean walks where you push it
//  - right side: a big ATTACK button (it picks the best enemy near you: heroes first, then a minion you
//    can finish off), and the ability buttons around it. TAP an ability to cast it at the best target,
//    or DRAG from it to aim it yourself (the aim shows on the ground), then let go to cast. Drag onto
//    CANCEL to change your mind. Hold an ability still for a moment to read what it does.
//  - tap the ground to walk there, tap an enemy to attack it; two fingers pinch to zoom
//  - the minimap: tap to walk there, drag to look around
import { clamp } from './engine.js';
import { abilityAt } from './data.js';
import { HALF } from './map.js';
import { $ } from './hud.js';

export const isTouchDevice = () => (navigator.maxTouchPoints > 1 && /iPad|iPhone|Android|Mobile|Macintosh/i.test(navigator.userAgent)) || matchMedia('(pointer: coarse)').matches;

export class Touch {
  constructor(app) {
    this.app = app; this.on = false; this.lastTouch = 0;
    this.joy = null; this.aim = null; this.atk = null; this.mm = null; this.pinch = null; this.tapId = null; this.pts = new Map();
    this.moveT = 0; this.atkT = 0;
    this.device = isTouchDevice();
    // the first touch anywhere switches the touch controls on (a mouse click on a computer switches them off again)
    addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') { this.lastTouch = performance.now(); if (!this.on) this.set(true); }
      else if (e.pointerType === 'mouse' && this.on && !this.device) this.set(false);
    }, true);
    if (this.device) this.set(true);
    this.wire();
  }
  // a mouse event that the browser makes up right after a tap (ignored: the tap was already handled)
  recent() { return performance.now() - this.lastTouch < 900; }
  set(on) {
    this.on = on; document.body.classList.toggle('touch', on);
    const tip = document.querySelector('#selPreview .tip'); if (tip) tip.textContent = on ? 'Drag to spin · pinch to zoom' : 'Drag to spin · scroll to zoom';
    if (this.app.hud && this.app.hud.m) this.app.hud.placeAbilities();
  }
  get m() { return this.app.match; }
  get p() { return this.app.match && this.app.match.player; }
  live() { const A = this.app; return A.state === 'game' && !A.paused && this.m && this.p && !A.hud.shopOpen; }

  wire() {
    const A = this.app;
    // ---------- the joystick ----------
    const zone = $('tJoy'), base = $('tJoyBase'), knob = $('tJoyKnob');
    zone.addEventListener('pointerdown', e => {
      if (this.joy || A.state !== 'game') return;
      e.preventDefault(); zone.setPointerCapture(e.pointerId); A.audio.unlock();
      this.joy = { id: e.pointerId, cx: e.clientX, cy: e.clientY, dx: 0, dy: 0 };
      base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; base.classList.add('on'); knob.style.transform = '';
      this.moveT = 0; A.input.held = false;
    });
    zone.addEventListener('pointermove', e => {
      const j = this.joy; if (!j || j.id !== e.pointerId) return;
      const R = 58; let dx = (e.clientX - j.cx) / R, dy = (e.clientY - j.cy) / R; const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      j.dx = dx; j.dy = dy; knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
    });
    const jEnd = e => {
      const j = this.joy; if (!j || j.id !== e.pointerId) return;
      this.joy = null; base.classList.remove('on'); base.style.left = base.style.top = ''; knob.style.transform = '';
      // stop walking when you let go (but keep fighting if you were)
      const p = this.p; if (p && p.order && p.order.type === 'move' && Math.hypot(j.dx, j.dy) > 0.2) this.m.orderStop(p);
    };
    zone.addEventListener('pointerup', jEnd); zone.addEventListener('pointercancel', jEnd);

    // ---------- attack ----------
    const atk = $('tAtk');
    atk.addEventListener('pointerdown', e => {
      e.preventDefault(); atk.setPointerCapture(e.pointerId); A.audio.unlock();
      this.atk = e.pointerId; atk.classList.add('on'); this.attack(true); this.atkT = 0.25;
    });
    const aEnd = e => { if (this.atk === e.pointerId) { this.atk = null; atk.classList.remove('on'); } };
    atk.addEventListener('pointerup', aEnd); atk.addEventListener('pointercancel', aEnd);

    // ---------- the top buttons ----------
    $('tPause').addEventListener('click', () => { if (A.state === 'game') A.setPause(!A.paused); });
    $('tScore').addEventListener('click', () => { const on = !$('scoreModal').classList.contains('on'); $('scoreModal').classList.toggle('on', on); if (on) A.hud.renderScore(); });
    $('scoreModal').addEventListener('click', () => { if (this.on) $('scoreModal').classList.remove('on'); });

    // ---------- the battlefield: tap to walk / attack, hold to keep walking, two fingers to zoom ----------
    const cv = $('gl');
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || A.state !== 'game') return;
      e.preventDefault(); this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pts.size === 2) {
        const [a, b] = [...this.pts.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), want: A.cam.want }; A.input.held = false; this.tapId = null; return;
      }
      if (this.pts.size > 2 || A.input.aim >= 0) return;
      this.tapId = e.pointerId;
      A.input.down({ button: 0, clientX: e.clientX, clientY: e.clientY, fromTouch: true });
    });
    cv.addEventListener('pointermove', e => {
      if (!this.pts.has(e.pointerId)) return;
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pts.size >= 2) {
        const [a, b] = [...this.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        A.cam.want = clamp(this.pinch.want * this.pinch.d / Math.max(30, d), 22, 64); return;
      }
      if (e.pointerId === this.tapId) { A.input.mouse.x = e.clientX; A.input.mouse.y = e.clientY; }
    });
    const cEnd = e => {
      if (!this.pts.delete(e.pointerId)) return;
      if (this.pts.size < 2) this.pinch = null;
      if (e.pointerId === this.tapId) { this.tapId = null; A.input.held = false; }
    };
    cv.addEventListener('pointerup', cEnd); cv.addEventListener('pointercancel', cEnd);

    // ---------- the minimap: tap to walk there, drag to look around ----------
    const mm = $('minimap');
    const toWorld = (e) => { const r = mm.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * HALF * 2 - HALF, (e.clientY - r.top) / r.height * HALF * 2 - HALF]; };
    mm.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      e.preventDefault(); e.stopPropagation(); mm.setPointerCapture(e.pointerId);
      this.mm = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    });
    mm.addEventListener('pointermove', e => {
      const s = this.mm; if (!s || s.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) s.moved = true;
      if (s.moved) { const [x, z] = toWorld(e); A.cam.lookAt(x, z, true); }
    });
    const mEnd = e => {
      const s = this.mm; if (!s || s.id !== e.pointerId) return; this.mm = null;
      if (!s.moved && e.type === 'pointerup' && A.state === 'game' && !A.paused) { const [x, z] = toWorld(e); A.input.moveOrder(x, z, true); }
      if (A.settings.cam !== 'free') A.cam.locked = true;
    };
    mm.addEventListener('pointerup', mEnd); mm.addEventListener('pointercancel', mEnd);

    // no zooming the page, no text selection, no long-press menus
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', e => { if (A.state === 'game' || e.target.closest('#selPreview')) e.preventDefault(); }, { passive: false });
    let lastEnd = 0;
    document.addEventListener('touchend', e => { const now = performance.now(); if (now - lastEnd < 320 && !e.target.closest('input,select,textarea')) e.preventDefault(); lastEnd = now; }, { passive: false });
  }

  // ---------- ability buttons (the same buttons the computer version shows, moved round the attack button) ----------
  bindAbility(el, i) {
    const A = this.app;
    el.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || !this.live()) return;
      e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); A.audio.unlock();
      const m = this.m, p = this.p, def = p.def.abilities[i];
      if (this.aim) return;
      // sprint and the other self abilities: just a tap
      if (def.type === 'self') { A.input.cast(i); this.press(el); return; }
      // not ready yet: casting tells you why (not learned yet, no mana); a cooldown just shows its timer
      if (!m.canCastNow(p, i)) { A.input.cast(i); return; }
      const r = el.getBoundingClientRect();
      this.aim = { id: e.pointerId, slot: i, el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, dx: 0, dy: 0, moved: false, over: false, info: false };
      this.aim.timer = setTimeout(() => { const a = this.aim; if (a && a.slot === i && !a.moved) { a.info = true; A.hud.showTip(el, () => A.hud.abilityTip(i), true); A.input.aim = -1; } }, 650);
      A.input.aim = i; A.input.touchAim = true;
      this.updateAim();
      $('tCancel').classList.add('on');
    });
    el.addEventListener('pointermove', e => {
      const a = this.aim; if (!a || a.id !== e.pointerId) return;
      a.dx = e.clientX - a.cx; a.dy = e.clientY - a.cy;
      const far = Math.hypot(a.dx, a.dy);
      // held still long enough to read about it, then dragged after all: aim it
      if (a.info && far > 26) { a.info = false; A.hud.hideTip(); A.input.aim = a.slot; }
      if (!a.info && far > 16) a.moved = true;
      const c = $('tCancel').getBoundingClientRect();
      a.over = Math.hypot(e.clientX - (c.left + c.width / 2), e.clientY - (c.top + c.height / 2)) < c.width * 0.75;
      $('tCancel').classList.toggle('hot', a.over);
      if (!a.info) this.updateAim();
    });
    const end = e => {
      const a = this.aim; if (!a || a.id !== e.pointerId) return;
      clearTimeout(a.timer); this.aim = null; A.input.touchAim = false;
      $('tCancel').classList.remove('on', 'hot');
      if (a.info) { A.hud.hideTip(); return; }
      if (a.over || e.type === 'pointercancel' || A.input.aim !== a.slot || !this.live()) { A.input.aim = -1; return; }
      this.updateAim(); A.input.aim = -1;
      const g = A.input.ground;
      this.m.cast(this.p, a.slot, g.x, g.z, this.aimTarget);
      this.press(a.el);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  press(el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
  // where the ability goes: dragged = where you pulled it (up to its range), tapped = the best target in range
  updateAim() {
    const a = this.aim, A = this.app, m = this.m, p = this.p; if (!a || !p) return;
    const ab = abilityAt(p.def.abilities[a.slot], Math.max(1, p.abil[a.slot].rank));
    const range = ab.range || 6;
    let x, z, tgt = null;
    if (a.moved) {
      const l = Math.hypot(a.dx, a.dy) || 1, k = Math.min(1, l / 120);
      const dist = ab.type === 'skillshot' ? range : Math.max(0.6, k * range);
      x = p.x + a.dx / l * dist; z = p.z + a.dy / l * dist;            // screen right = east, screen down = south
      if (ab.type === 'unit') tgt = this.nearestTo(x, z, 4);
    } else {
      tgt = this.bestTarget(range + 1);
      if (tgt) { x = tgt.x; z = tgt.z; }
      else { x = p.x + Math.sin(p.facing) * range * 0.7; z = p.z + Math.cos(p.facing) * range * 0.7; }
    }
    A.input.ground.x = clamp(x, -HALF + 2, HALF - 2); A.input.ground.z = clamp(z, -HALF + 2, HALF - 2);
    this.aimTarget = tgt;
  }
  enemies() {
    const m = this.m, p = this.p;
    return m.units.filter(u => u.alive && u.team !== p.team && u.targetable && m.visibleTo(u, p.team));
  }
  // heroes first, then a minion you can finish off, then monsters, and towers last
  bestTarget(range) {
    const p = this.p; let best = null, bs = 1e9;
    for (const u of this.enemies()) {
      const d = p.edge(u); if (d > range) continue;
      const s = d + (u.hero ? -100 : 0) + (u.kind === 'minion' ? u.hp / 40 : 0) + (u.kind === 'tower' || u.kind === 'core' ? 40 : 0);
      if (s < bs) { bs = s; best = u; }
    }
    return best;
  }
  nearestTo(x, z, r) { let best = null, bd = r; for (const u of this.enemies()) { const d = Math.hypot(u.x - x, u.z - z) - u.radius; if (d < bd && u.kind !== 'tower' && u.kind !== 'core') { bd = d; best = u; } } return best; }
  attack(first) {
    const A = this.app, m = this.m, p = this.p; if (!this.live() || !p.alive) return;
    const cur = p.order && p.order.type === 'attack' ? p.order.target : null;
    if (!first && cur && cur.alive) return;
    const t = this.bestTarget(p.st.range + 3) || this.bestTarget(14);
    if (t) { if (t !== cur) m.orderAttack(p, t); A.fx.ring({ x: t.x, y: m.groundY(t.x, t.z), z: t.z }, '#ff4d6d', t.radius + 1, 0.6, 0.35); }
    else if (first) A.hud.toast('No enemy nearby', 'bad');
  }
  // every frame: walk with the joystick, keep attacking while the button is held
  update(dt) {
    if (!this.on || !this.live()) return;
    const p = this.p, m = this.m, j = this.joy;
    if (j && Math.hypot(j.dx, j.dy) > 0.2) {
      this.moveT -= dt;
      if (this.moveT <= 0) {
        this.moveT = 0.1;
        const l = Math.hypot(j.dx, j.dy), x = clamp(p.x + j.dx / l * 5, -HALF + 2, HALF - 2), z = clamp(p.z + j.dy / l * 5, -HALF + 2, HALF - 2);
        m.orderMove(p, x, z);
      }
    }
    if (this.atk !== null) { this.atkT -= dt; if (this.atkT <= 0) { this.atkT = 0.25; this.attack(false); } }
    if (this.aim && !this.aim.info) this.updateAim();
  }
}
