// All the little pictures in the menus and on the screen, drawn as SVG (no emoji anywhere).
const S = (body, vb = '0 0 64 64') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
const ST = 'stroke="#1b1036" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"';

export const ICONS = {
  play: S(`<path d="M20 12 L52 32 L20 52 Z" fill="#fff" ${ST}/>`),
  locker: S(`<path d="M22 8 L32 14 L42 8 L58 18 L52 30 L46 27 L46 56 L18 56 L18 27 L12 30 L6 18 Z" fill="#ff6fd8" ${ST}/><path d="M26 12 Q32 20 38 12" fill="none" ${ST}/>`),
  party: S(`<ellipse cx="22" cy="34" rx="12" ry="16" fill="#3a86ff" ${ST}/><ellipse cx="42" cy="32" rx="12" ry="17" fill="#ffd23f" ${ST}/><circle cx="19" cy="30" r="2.6" fill="#1b1036"/><circle cx="26" cy="30" r="2.6" fill="#1b1036"/><circle cx="39" cy="27" r="2.6" fill="#1b1036"/><circle cx="46" cy="27" r="2.6" fill="#1b1036"/>`),
  gear: S(`<path d="M28 6h8l2 7 6 3 7-3 5 6-4 6 1 7 6 4-2 8-7 1-4 6 1 7-7 3-5-5h-6l-5 5-7-3 1-7-4-6-7-1-2-8 6-4 1-7-4-6 5-6 7 3 6-3z" fill="#cfd8ff" ${ST}/><circle cx="32" cy="32" r="8" fill="#1b1036"/>`),
  coin: S(`<circle cx="32" cy="32" r="24" fill="#ffd23f" ${ST}/><circle cx="32" cy="32" r="16" fill="none" stroke="#e0a400" stroke-width="3"/><path d="M28 22 Q38 22 38 28 Q38 32 32 32 Q26 32 26 37 Q26 42 36 42 M32 18 V46" fill="none" stroke="#a87400" stroke-width="3.5" stroke-linecap="round"/>`),
  heart: S(`<path d="M32 54 C10 40 6 28 10 19 C14 10 26 9 32 19 C38 9 50 10 54 19 C58 28 54 40 32 54 Z" fill="#ff4d6d" ${ST}/><ellipse cx="20" cy="21" rx="4" ry="3" fill="#fff" opacity=".7"/>`),
  drop: S(`<path d="M32 6 C24 20 14 30 14 40 A18 18 0 0 0 50 40 C50 30 40 20 32 6 Z" fill="#3a86ff" ${ST}/><path d="M24 40 A8 8 0 0 0 30 48" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`),
  snow: S(`<g ${ST} stroke="#9fd6ff" stroke-width="5"><path d="M32 6 V58 M9 19 L55 45 M9 45 L55 19"/><path d="M24 10 L32 16 L40 10 M24 54 L32 48 L40 54"/></g>`),
  trophy: S(`<path d="M18 8 H46 V22 C46 34 40 40 32 40 C24 40 18 34 18 22 Z" fill="#ffd23f" ${ST}/><path d="M18 14 H8 C8 26 14 30 20 30 M46 14 H56 C56 26 50 30 44 30" fill="none" ${ST}/><path d="M28 40 H36 V48 H28 Z M20 48 H44 V56 H20 Z" fill="#ffb703" ${ST}/>`),
  skull: S(`<path d="M32 6 C48 6 56 16 56 28 C56 38 50 42 48 46 L48 54 L16 54 L16 46 C14 42 8 38 8 28 C8 16 16 6 32 6 Z" fill="#f1f3f5" ${ST}/><ellipse cx="22" cy="30" rx="6" ry="7" fill="#1b1036"/><ellipse cx="42" cy="30" rx="6" ry="7" fill="#1b1036"/><path d="M32 36 L28 44 H36 Z" fill="#1b1036"/>`),
  menu: S(`<path d="M12 18 H52 M12 32 H52 M12 46 H52" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`),
  close: S(`<path d="M16 16 L48 48 M48 16 L16 48" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`),
  check: S(`<path d="M12 34 L26 48 L52 18" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`),
  lock: S(`<path d="M20 28 V20 A12 12 0 0 1 44 20 V28" fill="none" stroke="#cfd8ff" stroke-width="6"/><rect x="12" y="28" width="40" height="28" rx="6" fill="#ffd23f" ${ST}/><circle cx="32" cy="41" r="4" fill="#1b1036"/>`),
  home: S(`<path d="M8 30 L32 8 L56 30 M14 26 V56 H50 V26" fill="#7bd389" ${ST}/><rect x="26" y="38" width="12" height="18" fill="#8d5524" ${ST}/>`),
  jump: S(`<path d="M32 10 L54 34 H40 V54 H24 V34 H10 Z" fill="#fff" ${ST}/>`),
  left: S(`<path d="M40 10 L18 32 L40 54" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`),
  right: S(`<path d="M24 10 L46 32 L24 54" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`),
  eye: S(`<path d="M4 32 C16 14 48 14 60 32 C48 50 16 50 4 32 Z" fill="#fff" ${ST}/><circle cx="32" cy="32" r="9" fill="#3a86ff" ${ST}/><circle cx="32" cy="32" r="3.5" fill="#1b1036"/>`),
  copy: S(`<rect x="20" y="20" width="32" height="36" rx="5" fill="#fff" ${ST}/><path d="M14 44 V12 A4 4 0 0 1 18 8 H42" fill="none" ${ST} stroke="#fff"/>`),
  user: S(`<ellipse cx="32" cy="36" rx="18" ry="22" fill="#ffd23f" ${ST}/><circle cx="26" cy="30" r="3" fill="#1b1036"/><circle cx="38" cy="30" r="3" fill="#1b1036"/><path d="M26 40 Q32 45 38 40" fill="none" ${ST}/>`),
  shield: S(`<path d="M32 6 L54 14 V30 C54 44 44 54 32 58 C20 54 10 44 10 30 V14 Z" fill="#7bd389" ${ST}/>`),
  bean: S(`<ellipse cx="32" cy="34" rx="18" ry="24" fill="#ff7a3d" ${ST}/><ellipse cx="25" cy="27" rx="5" ry="6" fill="#fff" ${ST} stroke-width="2.5"/><ellipse cx="39" cy="27" rx="5" ry="6" fill="#fff" ${ST} stroke-width="2.5"/><circle cx="26" cy="28" r="2.4" fill="#1b1036"/><circle cx="40" cy="28" r="2.4" fill="#1b1036"/><path d="M26 39 Q32 44 38 39" fill="none" ${ST}/>`),

  // the disasters
  flood: S(`<path d="M4 26 Q12 18 20 26 T36 26 T52 26 T60 26 V58 H4 Z" fill="#3a86ff" ${ST}/><path d="M4 40 Q12 32 20 40 T36 40 T52 40 T60 40" fill="none" stroke="#9fd6ff" stroke-width="4" stroke-linecap="round"/><path d="M30 6 V18 M24 12 L30 18 L36 12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),
  tsunami: S(`<path d="M6 56 C6 30 20 10 42 10 C54 10 60 18 58 26 C56 20 48 18 42 22 C34 28 38 40 48 42 C40 48 30 44 28 36 C24 46 22 52 22 56 Z" fill="#2a9df4" ${ST}/><path d="M44 14 C52 12 57 18 56 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`),
  tornado: S(`<path d="M6 10 H58 M12 20 H52 M18 30 H46 M24 40 H40 M28 50 H36 M30 58 H34" stroke="#cfc6b8" stroke-width="7" stroke-linecap="round"/><path d="M6 10 H58 M12 20 H52 M18 30 H46 M24 40 H40 M28 50 H36" stroke="#1b1036" stroke-width="1.5" stroke-linecap="round" opacity=".4"/>`),
  meteor: S(`<path d="M8 8 L34 30 M14 4 L40 26 M4 16 L28 36" stroke="#ff9e00" stroke-width="5" stroke-linecap="round"/><circle cx="42" cy="42" r="15" fill="#5a3a2e" ${ST}/><circle cx="37" cy="38" r="3.5" fill="#3a241c"/><circle cx="47" cy="47" r="4" fill="#3a241c"/><path d="M30 36 Q34 30 40 30" fill="none" stroke="#ff5a1f" stroke-width="4" stroke-linecap="round"/>`),
  quake: S(`<path d="M4 44 H60 V58 H4 Z" fill="#a0673a" ${ST}/><path d="M30 44 L26 50 L32 54 L28 58" fill="none" stroke="#1b1036" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="18" y="16" width="26" height="28" fill="#cfe8ff" ${ST} transform="rotate(-8 31 30)"/><path d="M8 24 L4 20 M8 32 L2 32 M56 24 L60 20 M56 32 L62 32" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`),
  volcano: S(`<path d="M4 58 L22 22 H42 L60 58 Z" fill="#5b4b49" ${ST}/><path d="M22 22 C26 30 28 26 30 32 C32 26 36 32 38 26 C40 30 42 24 42 22 Z" fill="#ff5a00"/><path d="M26 18 Q22 8 30 4 M38 18 Q44 10 38 4" fill="none" stroke="#ff9e00" stroke-width="5" stroke-linecap="round"/>`),
  lightning: S(`<path d="M10 22 C10 12 22 8 28 14 C32 6 48 6 50 18 C58 18 60 30 50 32 H14 C6 32 4 24 10 22 Z" fill="#5c677d" ${ST}/><path d="M34 32 L24 46 H32 L26 60 L44 40 H35 L40 32 Z" fill="#ffd23f" ${ST}/>`),
  blizzard: S(`<path d="M10 22 C10 12 22 8 28 14 C32 6 48 6 50 18 C58 18 60 30 50 32 H14 C6 32 4 24 10 22 Z" fill="#e8f1ff" ${ST}/><g stroke="#9fd6ff" stroke-width="4" stroke-linecap="round"><path d="M20 40 V52 M14 46 H26 M42 40 V52 M36 46 H48 M31 50 V60 M26 55 H36"/></g>`),
  acid: S(`<path d="M10 22 C10 12 22 8 28 14 C32 6 48 6 50 18 C58 18 60 30 50 32 H14 C6 32 4 24 10 22 Z" fill="#6b8f3a" ${ST}/><g fill="#b6ff5a" ${ST} stroke-width="2.5"><path d="M18 40 C15 46 15 50 18 50 C21 50 21 46 18 40 Z"/><path d="M32 44 C29 50 29 54 32 54 C35 54 35 50 32 44 Z"/><path d="M46 40 C43 46 43 50 46 50 C49 50 49 46 46 40 Z"/></g>`)
};
export const icon = (k) => ICONS[k] || '';
// put icons into every element with data-ic="name"
export function fillIcons(root = document) { root.querySelectorAll('[data-ic]').forEach(el => { if (!el.dataset.done) { el.insertAdjacentHTML('afterbegin', icon(el.dataset.ic)); el.dataset.done = 1; } }); }
