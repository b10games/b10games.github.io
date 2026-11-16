// Settings and saved progress (kept in this browser; B10GAMES accounts copy them between devices).
import { DEFAULT_OUTFIT, CHALLENGES } from './data.js';

export const isTouch = (navigator.maxTouchPoints > 1 && /Mac|iPad|Android|Mobile/i.test(navigator.userAgent)) || matchMedia('(pointer: coarse)').matches;

const SKEY = 'pp-settings', DKEY = 'pp-save';
function read(k) { try { return JSON.parse(localStorage.getItem(k)) || null; } catch (e) { return null; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

export const DEFAULTS = {
  assist: 2, gear: 'board', showKeys: !isTouch, touchSize: 1, touchOpacity: 0.85, sens: 1,
  quality: isTouch ? 'low' : 'high', music: 0.5, sfx: 0.8, res: 1
};
export function loadSettings() { return { ...DEFAULTS, ...(read(SKEY) || {}) }; }
export function saveSettings(s) { write(SKEY, s); }

export function loadSave() {
  const s = read(DKEY) || {};
  return {
    outfit: { ...DEFAULT_OUTFIT, ...(s.outfit || {}) }, gear: s.gear || null,
    mode: { id: 'free', drop: 'peak', spot: 'park', course: 'peak', ...(s.mode || {}) },
    career: s.career || 0, stats: s.stats || {}, best: { tricks: {}, time: {}, ...(s.best || {}) }, done: s.done || {}
  };
}
export function storeSave(s) { write(DKEY, s); }

// challenge progress from the stats
export function challengeState(save) {
  return CHALLENGES.map(c => {
    let v = save.stats[c.stat] || 0;
    if (Array.isArray(v)) v = v.length;
    return { ...c, v: Math.min(v, c.goal), done: v >= c.goal };
  });
}
