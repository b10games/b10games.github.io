// Buttcraft iPad extras.
// - Inventory, chests, crafting table, furnace etc. work properly with a finger:
//     tap            = take / place the whole stack (like a left click)
//     hold           = take half a stack, or place one item (like a right click)
//     drag a stack   = move it to the slot where you let go (drag and drop)
//     drag while holding = drop one item in every slot you slide over (great for crafting)
//     double-tap     = quick move (like shift-click)
//   plus three mode buttons (Whole stack / Half or one / Quick move) and a "Holding: ..." readout.
// - Bigger slots on touch screens, a bigger hotbar on iPad, and the hotbar moves above the
//   buttons when the iPad is held upright.
// - Floating joystick: put your thumb anywhere on the lower left and the joystick appears there.
// - iPad controls switch on by themselves the first time the game runs on a touch screen.
(function () {
  const touchScreen = () => (navigator.maxTouchPoints || 0) > 1 || ('ontouchstart' in window && (navigator.maxTouchPoints || 0) > 0);

  const css = `
  .bc-touch .container-screen { --slot: 52px; touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  @media (max-height: 660px) { .bc-touch .container-screen { --slot: 46px; } }
  @media (max-width: 720px), (max-height: 560px) { .bc-touch .container-screen { --slot: 38px; } }
  .bc-touch .container-screen .slot { -webkit-tap-highlight-color: transparent; }
  .bc-touch .container-screen .cgrid { touch-action: pan-y; }
  .bc-tbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 4px 50px 4px 0; width: 0; min-width: 100%; box-sizing: border-box; }
  .bc-modes { display: flex; gap: 6px; }
  .bc-modes button { font: 600 15px var(--ui-font, sans-serif); color: #3c342c; background: #d9cdbf; border: 2px solid; border-color: #f4ece2 #6e6257 #6e6257 #f4ece2; border-radius: 8px; padding: 8px 12px; min-height: 40px; touch-action: manipulation; }
  .bc-modes button.on { background: #ffcf6e; color: #2b2118; border-color: #fff4d6 #8a5a1a #8a5a1a #fff4d6; box-shadow: 0 0 0 2px #2b2118; }
  .bc-held { font: 600 15px var(--ui-font, sans-serif); color: #2b2118; min-height: 20px; }
  .bc-tip { flex-basis: 100%; font-size: 12px; color: #5a4e44; line-height: 1.35; }
  .bc-touch .cursor-stack { transition: none; }
  @media (min-width: 900px) and (min-height: 600px) { .bc-touch #hud .bottom { --slot: 50px; } }
  @media (orientation: portrait) and (max-width: 1100px) { .bc-touch #hud .bottom { bottom: 200px; } }
  .touch-ui .t-stick.bc-float { transition: none; }
  .slot.bc-flash { animation: bcFlash .28s ease-out; }
  @keyframes bcFlash { 0% { box-shadow: 0 0 0 4px #ffcf6e inset; transform: scale(1.12); } 100% { box-shadow: none; transform: none; } }
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  function boot() {
    const g = window.__game;
    if (!g || !g.ui || !g.ui.containers || !g.settings) return setTimeout(boot, 150);
    init(g);
  }
  boot();

  function init(game) {
    // switch the iPad controls on once, the first time we see a touch screen
    try {
      if (touchScreen() && !localStorage.getItem('bc-touch-auto')) {
        localStorage.setItem('bc-touch-auto', '1');
        if (!game.settings.touchControls) {
          game.settings.touchControls = true;
          if (game.saveSettings) game.saveSettings();
          const b = document.querySelector('#touch');
          if (b) b.textContent = 'iPad Controls On';
        }
      }
    } catch (e) { /* storage blocked */ }

    const C = game.ui.containers, root = C.el;
    const coarse = () => matchMedia('(pointer: coarse)').matches;
    const touchOn = () => !!game.settings.touchControls || coarse();
    let mode = 'all';                  // 'all' | 'one' | 'move'
    let T = null, lastTap = null;

    const keyOf = s => s.dataset.g + ':' + s.dataset.i;
    const clone = st => (st ? JSON.parse(JSON.stringify(st)) : null);
    const same = (a, b) => a && b && a.id === b.id && (a.dmg || 0) === (b.dmg || 0) && JSON.stringify(a.ench || null) === JSON.stringify(b.ench || null) && (a.customName || '') === (b.customName || '');
    const plainGroup = name => { const gr = C.groups[name]; return gr && !gr.result && !gr.creative && !gr.trash && !gr.offer && gr.kind !== 'output'; };
    const act = (el, button, shift) => { C.onMouseDown({ target: el, button, shiftKey: !!shift, preventDefault() {} }); };
    const flash = el => { el.classList.remove('bc-flash'); void el.offsetWidth; el.classList.add('bc-flash'); };
    const placeCursor = (x, y) => { C.cursorEl.style.transform = `translate(${x - 22}px, ${y - 78}px)`; };
    const slotAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('.slot') : null; };

    // ---------- mode bar ----------
    function addBar() {
      const panel = root.querySelector('.panel');
      if (!panel || panel.querySelector('.bc-tbar')) return;
      const bar = document.createElement('div');
      bar.className = 'bc-tbar';
      bar.innerHTML = `<div class="bc-modes">
          <button data-m="all">&#9995; Whole stack</button>
          <button data-m="one">&frac12; Half / one</button>
          <button data-m="move">&#8645; Quick move</button>
        </div><div class="bc-held"></div>
        <div class="bc-tip">Hold a stack to split it &middot; Drag a stack over slots to put one in each &middot; Double-tap to quick-move</div>`;
      const close = panel.querySelector('.t-close');
      panel.insertBefore(bar, close ? close.nextSibling : panel.firstChild);
      bar.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        mode = b.dataset.m; paintModes();
        if (game.audio) game.audio.play('click', { vol: 0.15 });
      }));
      paintModes(); paintHeld();
    }
    function paintModes() { root.querySelectorAll('.bc-modes [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === mode)); }
    function paintHeld() {
      const h = root.querySelector('.bc-held');
      if (!h) return;
      const c = C.cursor;
      h.textContent = c ? 'Holding: ' + ((window.__label && window.__label(c.id)) || 'item') + (c.count > 1 ? ' × ' + c.count : '') : '';
    }

    const origOpen = C.open.bind(C);
    C.open = function (t, e) {
      const r = origOpen(t, e);
      // hide the in-game joystick/buttons layer right away so it can't sit on top of the inventory
      try { if (game.touch && game.touch.update) game.touch.update(); } catch (err) { /* ignore */ }
      document.body.classList.toggle('bc-touch', touchOn());
      if (touchOn()) addBar();
      return r;
    };
    const origRefresh = C.refresh.bind(C);
    C.refresh = function () { const r = origRefresh(); paintHeld(); return r; };

    // ---------- touch handling ----------
    function onStart(e) {
      if (!C.type) return;
      if (e.touches.length > 1) { cancel(); return; }
      const t = e.changedTouches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY) || e.target;
      const slot = el && el.closest ? el.closest('.slot') : null;
      const inPanel = el && el.closest && el.closest('.panel');
      // buttons, tabs, the search box and the close button keep their normal behaviour
      if (!slot && (inPanel || !C.cursor)) { T = null; return; }
      if (!slot || !lastTap || lastTap.k !== keyOf(slot)) lastTap = null;   // a double-tap must hit the same slot
      const inGrid = !!(el.closest && el.closest('.cgrid'));
      if (!inGrid) e.preventDefault();          // no page zoom, no fake mouse clicks
      T = { id: t.identifier, x0: t.clientX, y0: t.clientY, slot, el, hadCursor: !!C.cursor, long: false, moved: false, painted: new Set(), inGrid, timer: null };
      placeCursor(t.clientX, t.clientY);
      if (slot) T.timer = setTimeout(longPress, 380);
    }
    function longPress() {
      if (!T || T.moved || !T.slot) return;
      T.long = true;
      if (T.hadCursor && plainGroup(T.slot.dataset.g) && !canPaint(T.slot)) return;
      act(T.slot, 2, false);                   // take half / place one
      T.painted.add(keyOf(T.slot));
      flash(T.slot);
      paintHeld();
    }
    function canPaint(s) {
      if (!C.cursor || !plainGroup(s.dataset.g)) return false;
      const st = C.getStack(s.dataset.g, +s.dataset.i);
      return !st || same(st, C.cursor);
    }
    function paint(s) {
      const k = keyOf(s);
      if (T.painted.has(k)) return;
      T.painted.add(k);
      if (!canPaint(s)) return;
      act(s, 2, false);
      flash(s);
    }
    function onMove(e) {
      if (!T) return;
      const t = [...e.changedTouches].find(x => x.identifier === T.id);
      if (!t) return;
      placeCursor(t.clientX, t.clientY);
      if (!T.moved && Math.hypot(t.clientX - T.x0, t.clientY - T.y0) > 12) {
        T.moved = true; clearTimeout(T.timer);
        if (T.hadCursor && !T.inGrid && T.slot && !T.long) paint(T.slot);   // painting: the first slot gets one too
        else if (!T.hadCursor && !T.inGrid && T.slot) {
          // drag and drop: carry the stack (or the half we just took) with the finger
          const g = T.slot.dataset.g;
          if (!C.cursor && (plainGroup(g) || C.groups[g] && C.groups[g].result) && C.getStack(g, +T.slot.dataset.i)) act(T.slot, 0, false);
          T.drag = !!C.cursor;
          paintHeld();
        }
      }
      if (!T.moved) return;
      if (T.drag) { e.preventDefault(); return; }
      if (T.hadCursor && !T.inGrid) {
        e.preventDefault();
        const s = slotAt(t.clientX, t.clientY);
        if (s && C.cursor) paint(s);
        paintHeld();
      } else if (!T.inGrid) e.preventDefault();
    }
    function onEnd(e) {
      if (!T) return;
      const t = [...e.changedTouches].find(x => x.identifier === T.id);
      if (!t) return;
      const was = T; T = null;
      clearTimeout(was.timer);
      if (e.cancelable) e.preventDefault();
      if (was.drag || was.long || was.painted.size || was.moved || !was.slot) lastTap = null;
      if (was.drag) { drop(was, t); return; }
      if (was.long || was.painted.size) { C.refresh(); return; }
      if (was.moved) return;                   // a scroll in the item list, or a drag that hit nothing
      if (!was.slot) { act(was.el, mode === 'one' ? 2 : 0, false); return; }   // tap outside: drop the held stack
      const k = keyOf(was.slot), now = performance.now(), g = was.slot.dataset.g, i = +was.slot.dataset.i;
      // double-tap = quick move: undo the first tap (only if nothing changed since), then shift-click
      if (mode === 'all' && lastTap && lastTap.k === k && now - lastTap.t < 340) {
        if (lastTap.undo && lastTap.unchanged()) lastTap.undo();
        act(was.slot, 0, true);
        lastTap = null; flash(was.slot); return;
      }
      if (mode !== 'all' || !plainGroup(g)) {
        act(was.slot, mode === 'one' ? 2 : 0, mode === 'move');
        lastTap = mode === 'all' ? { k, t: now, undo: null, unchanged: () => false } : null;
        return;
      }
      const before = { cursor: clone(C.cursor), stack: clone(C.getStack(g, i)) };
      act(was.slot, 0, false);
      const after = JSON.stringify([C.cursor, C.getStack(g, i)]);
      lastTap = {
        k, t: now,
        unchanged: () => JSON.stringify([C.cursor, C.getStack(g, i)]) === after,
        undo: () => { C.cursor = before.cursor; C.setStack(g, i, before.stack); C.refresh(); }
      };
    }
    // let go of a dragged stack: place it on the slot under the finger, otherwise put it back
    function drop(was, t) {
      const start = was.slot, sg = start.dataset.g, si = +start.dataset.i;
      const target = slotAt(t.clientX, t.clientY);
      if (target && target !== start && C.cursor) act(target, 0, false);
      if (C.cursor && plainGroup(sg)) {
        const st = C.getStack(sg, si);
        if (!st || same(st, C.cursor)) act(start, 0, false);   // back where it came from (or the other half of a swap)
      }
      if (target) flash(target);
      C.refresh();
    }
    function cancel() { if (T) clearTimeout(T.timer); T = null; }

    root.addEventListener('touchstart', onStart, { passive: false, capture: true });
    root.addEventListener('touchmove', onMove, { passive: false, capture: true });
    root.addEventListener('touchend', onEnd, { passive: false, capture: true });
    root.addEventListener('touchcancel', cancel, { capture: true });

    // ---------- in-game: floating joystick ----------
    const TC = game.touch;
    if (TC && TC.start && TC.stick) {
      const origStart = TC.start.bind(TC), origEnd = TC.end.bind(TC);
      TC.start = function (e) {
        if (this.stickId === null) {
          for (const t of e.changedTouches) {
            const x = t.clientX, y = t.clientY;
            if (x > innerWidth * 0.4 || y < innerHeight * 0.38) continue;
            const el = document.elementFromPoint(x, y);
            if (el && el.closest && (el.closest('.t-btn') || el.closest('.t-stick'))) break;
            if (this.hotbarSlotAt(x, y) >= 0) break;
            const r = this.stick.getBoundingClientRect();
            this.stick.style.left = (x - r.width / 2) + 'px';
            this.stick.style.bottom = (innerHeight - y - r.height / 2) + 'px';
            this.stick.classList.add('bc-float');
            break;
          }
        }
        return origStart(e);
      };
      TC.end = function (e) {
        const had = this.stickId;
        const r = origEnd(e);
        if (had !== null && this.stickId === null) { this.stick.style.left = ''; this.stick.style.bottom = ''; this.stick.classList.remove('bc-float'); }
        return r;
      };
    }
    // keep the page class in sync with the iPad-controls setting
    const sync = () => document.body.classList.toggle('bc-touch', touchOn());
    sync(); setInterval(sync, 700);

    window.__bcTouchPlus = { get mode() { return mode; }, set mode(m) { mode = m; paintModes(); } };
  }
})();
