// Background worker: works out the heights for a tile of snow, so building detail never makes the game stutter.
import { terrain } from './terrain.js';
onmessage = (e) => {
  const { id, x0, z0, s, G } = e.data, H = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) H[j * G + i] = terrain(x0 + (i - 1) * s, z0 + (j - 1) * s);
  postMessage({ id, H }, [H.buffer]);
};
