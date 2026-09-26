// Bot players shared by the balance and loudness harnesses. `manage` is a near-optimal manager:
// it rebuilds, builds, awakens, places toward the unexplored frontier, and buys the cheapest option.
import * as S from '../public/play/src/sim.js';
import { CENTER } from '../public/play/src/content.js';

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const botRng = new WeakMap();

function random(state) {
  let rng = botRng.get(state);
  if (rng === undefined) rng = state.rng;
  rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
  botRng.set(state, rng);
  return rng / 4294967296;
}

function freeSpotToward(state, target) {
  // Walk from the target back toward the conductor; take the farthest placeable point.
  for (let f = 1; f >= 0.2; f -= 0.05) {
    const p = { x: CENTER.x + (target.x - CENTER.x) * f, y: CENTER.y + (target.y - CENTER.y) * f };
    if (!S.placementReason(state, p.x, p.y)) return p;
  }
  return null;
}

export function manage(state) {
  // Choose the motif offered first; call nothing early.
  if (state.motifOffer) S.chooseMotif(state, state.motifOffer[0]);
  for (const b of state.beings) if (b.hp <= 0) S.rebuild(state, b.id);
  for (const w of state.wells) if (w.hp <= 0) S.rebuild(state, w.id);
  for (const s of state.sites) if (s.discovered && !s.taken && s.kind === 'well') S.buildWell(state, s.id);
  for (const s of state.sites) if (s.discovered && !s.taken && s.kind === 'being' && S.isCovered(state, s)) S.awaken(state, s.id);
  const frontier = state.sites.filter(s => !s.discovered).sort((a, b) => dist(a, CENTER) - dist(b, CENTER));
  for (const b of state.beings) if (!b.placed && b.hp > 0) {
    const goal = frontier[0] || { x: CENTER.x + (random(state) - 0.5) * 200, y: CENTER.y + (random(state) - 0.5) * 300 };
    const p = freeSpotToward(state, goal) || freeSpotToward(state, { x: CENTER.x + 60, y: CENTER.y + 60 });
    if (p) S.place(state, b.id, p.x, p.y);
  }
  // Spend: cheapest useful purchase first.
  const options = [];
  for (const w of state.wells) options.push([S.wellUpgradeCost(w), () => S.upgradeWell(state, w.id)]);
  for (const b of state.beings.filter(b => b.placed)) for (const k of ['mastery', 'subdivision', 'octave', 'reach']) options.push([S.devCost(b, k) * (k === 'reach' ? 1.5 : 1), () => S.develop(state, b.id, k)]);
  for (const k of ['touch', 'tempo', 'reach', 'breath']) options.push([S.globalCost(state, k) * (k === 'breath' ? 2 : 1.2), () => S.buyGlobal(state, k)]);
  options.sort((a, b) => a[0] - b[0]);
  for (const [cost, act] of options) { if (!Number.isFinite(cost) || cost > state.resonance) break; act(); }
}
