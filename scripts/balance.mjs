// Balance harness: plays whole runs with simple bots and reports how far and how long each got.
// Usage: node scripts/balance.mjs [runs]
import * as S from '../public/play/src/sim.js';
import { CENTER } from '../public/play/src/content.js';
import { manage, dist } from './bots.mjs';

const DT = 1 / 30;

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
