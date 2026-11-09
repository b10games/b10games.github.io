export const LAP_TARGET = 3;
export const REWARDS = {
  Easy: { 1: 1000, 2: 750, 3: 500 },
  Medium: { 1: 1500, 2: 1250, 3: 1000 },
  Hard: { 1: 2000, 2: 1750, 3: 1500 },
};

export function rewardFor(place, difficulty = "Easy") {
  const table = REWARDS[difficulty] || REWARDS.Easy;
  return table[place] || 0;
}

export function createRacerState(sampleIndex) {
  return {
    sampleIndex,
    total: sampleIndex,
    prevSample: sampleIndex,
    laps: 0,
    nextCp: 1,
    seenStart: false,
    lapStart: 0,
    lapTimes: [],
    lastCp: sampleIndex,
    finished: false,
  };
}

export function progressDelta(prevIndex, nextIndex, n) {
  let delta = nextIndex - prevIndex;
  if (delta > n / 2) delta -= n;
  if (delta < -n / 2) delta += n;
  return delta;
}

export function crossedForward(prev, idx, checkpoints, n) {
  if (prev === idx) return [];
  const delta = progressDelta(prev, idx, n);
  if (delta <= 0) return [];
  const crossed = [];
  if (idx > prev) {
    for (const cp of checkpoints) {
      if (cp > prev && cp <= idx) crossed.push(cp);
    }
    return crossed;
  }
  for (const cp of checkpoints) {
    if (cp > prev || cp <= idx) crossed.push(cp);
  }
  crossed.sort((a, b) => (a > prev ? a : a + n) - (b > prev ? b : b + n));
  return crossed;
}

export function onCheckpoint(state, cp, checkpoints, now, lapTarget = LAP_TARGET) {
  const cpNum = checkpoints.indexOf(cp);
  if (cpNum < 0 || state.finished) return false;
  if (cpNum === 0 && !state.seenStart) {
    state.seenStart = true;
    state.lapStart = now;
  }
  if (cpNum !== state.nextCp) return false;
  state.nextCp = (cpNum + 1) % checkpoints.length;
  state.lastCp = cp;
  if (cpNum === 0) {
    state.lapTimes.push(Math.max(0, now - state.lapStart));
    state.lapStart = now;
    state.laps += 1;
    if (state.laps >= lapTarget) {
      state.finished = true;
      return true;
    }
  }
  return false;
}

export function applyCrossings(state, prev, idx, checkpoints, n, now, lapTarget = LAP_TARGET) {
  const crossed = crossedForward(prev, idx, checkpoints, n);
  let finished = false;
  for (const cp of crossed) {
    if (onCheckpoint(state, cp, checkpoints, now, lapTarget)) finished = true;
  }
  state.prevSample = idx;
  return finished;
}

export function placeOf(racers, me) {
  let ahead = 0;
  for (const r of racers) {
    if (r !== me && r.total > me.total) ahead += 1;
  }
  return ahead + 1;
}

export function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
}

export function formatCoins(n) {
  return Math.floor(n).toLocaleString("en-US");
}
