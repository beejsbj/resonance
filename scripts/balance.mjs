// Balance harness: plays whole runs with simple bots and reports how far and how long each got.
// Usage: node scripts/balance.mjs [runs]
import * as S from '../public/play/src/sim.js';
import { CENTER } from '../public/play/src/content.js';

const DT = 1 / 30;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function freeSpotToward(state, target) {
  // Walk from the target back toward the conductor; take the farthest placeable point.
  for (let f = 1; f >= 0.2; f -= 0.05) {
    const p = { x: CENTER.x + (target.x - CENTER.x) * f, y: CENTER.y + (target.y - CENTER.y) * f };
    if (!S.placementReason(state, p.x, p.y)) return p;
  }
  return null;
}

function manage(state) {
  // Choose the motif offered first; call nothing early.
  if (state.motifOffer) S.chooseMotif(state, state.motifOffer[0]);
  for (const b of state.beings) if (b.hp <= 0) S.rebuild(state, b.id);
  for (const w of state.wells) if (w.hp <= 0) S.rebuild(state, w.id);
  for (const s of state.sites) if (s.discovered && !s.taken && s.kind === 'well') S.buildWell(state, s.id);
  for (const s of state.sites) if (s.discovered && !s.taken && s.kind === 'being' && S.isCovered(state, s)) S.awaken(state, s.id);
  const frontier = state.sites.filter(s => !s.discovered).sort((a, b) => dist(a, CENTER) - dist(b, CENTER));
  for (const b of state.beings) if (!b.placed && b.hp > 0) {
    const goal = frontier[0] || { x: CENTER.x + (Math.random() - 0.5) * 200, y: CENTER.y + (Math.random() - 0.5) * 300 };
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

function play(bot, seed) {
  const state = S.newRun(S.newMeta(), seed);
  let t = 0, nextManage = 0, nextTap = 0;
  const limit = 60 * 90;
  while (state.phase !== 'defeated' && t < limit) {
    S.step(state, DT); t += DT;
    if (bot !== 'idle' && t >= nextManage) { manage(state); nextManage = t + 2; }
    if (bot === 'active' && t >= nextTap) {
      const target = state.enemies.slice().sort((a, b) => dist(a, CENTER) - dist(b, CENTER))[0];
      if (state.boss?.shell && state.conductor.power >= 30) S.swipe(state, { x: state.boss.x - 40, y: state.boss.y }, { x: state.boss.x + 40, y: state.boss.y });
      else S.tap(state, target ? { x: target.x, y: target.y } : state.boss ? { x: state.boss.x, y: state.boss.y } : { x: 40, y: 40 });
      nextTap = t + 0.3;
    }
  }
  return { bot, seed, wave: state.wave, minutes: +(t / 60).toFixed(1), beings: state.beings.filter(b => b.placed).length, wells: state.wells.length, lifetime: Math.round(state.lifetime), echoes: S.echoesFor(state), cause: state.boss ? 'crisis' : 'wave', timeout: t >= limit };
}

const runs = Number(process.argv[2] || 4);
for (const bot of ['idle', 'manager', 'active']) {
  const results = Array.from({ length: runs }, (_, i) => play(bot, 1000 + i * 7919));
  const avg = k => (results.reduce((s, r) => s + r[k], 0) / runs).toFixed(1);
  console.log(`${bot.padEnd(8)} wave ${avg('wave')}  minutes ${avg('minutes')}  beings ${avg('beings')}  wells ${avg('wells')}  lifetime ${avg('lifetime')}  echoes ${avg('echoes')}  timeouts ${results.filter(r => r.timeout).length}  died-in-crisis ${results.filter(r => r.cause === 'crisis').length}  waves [${results.map(r => r.wave).join(",")}]`);
}
