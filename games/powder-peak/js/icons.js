// Small hand-made SVG icons (no emojis).
const S = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICON = {
  mountain: S('<path d="M2 20 9 7l4 6 3-4 6 11z"/><path d="m7.5 10 1.5 1.5L11 9.5"/>'),
  flip: S('<path d="M12 4a8 8 0 1 1-7.4 5"/><path d="M4 4v5h5"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>'),
  clock: S('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>'),
  party: S('<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M2.5 20c.5-3.5 2.8-5.5 5.5-5.5s5 2 5.5 5.5M13.5 15c1-1 2-1.4 3-1.4 2.4 0 4.4 1.8 5 5"/>'),
  gear: S('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  user: S('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/>'),
  trophy: S('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8M9.5 18h5"/>'),
  check: S('<path d="m4.5 12.5 5 5 10-11"/>'),
  close: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  pause: S('<path d="M8 5v14M16 5v14"/>'),
  play: S('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  map: S('<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  lift: S('<path d="M2 5 22 3"/><path d="M12 4v6"/><path d="M7 10h10v4H7zM7 14v3M17 14v3"/>'),
  board: S('<rect x="9" y="1.8" width="6" height="20.4" rx="3"/><path d="M9 8h6M9 16h6"/>'),
  skis: S('<path d="M7 22V5a2 2 0 0 1 2-2M15 22V5a2 2 0 0 1 2-2"/><path d="M5.5 12h4M13.5 12h4"/>'),
  copy: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  crown: S('<path d="M3 18 5 7l4.5 4.5L12 5l2.5 6.5L19 7l2 11z"/>'),
  back: S('<path d="M15 5 8 12l7 7"/>'),
  home: S('<path d="M3 11 12 3l9 8M5 9.5V21h14V9.5"/>'),
  flag: S('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  star: S('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  snow: S('<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2"/>'),
  keys: S('<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 15h10"/>'),
  ready: S('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>'),
  restart: S('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>'),
  full: S('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  arrow: S('<path d="M12 3 20 20l-8-4-8 4z" fill="currentColor"/>')
};
export function fillIcons(root = document) { root.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = ICON[el.dataset.ic] || ''; el.classList.add('ic'); }); }
