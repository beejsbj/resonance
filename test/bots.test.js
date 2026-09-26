import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../public/play/src/sim.js';
import { manage } from '../scripts/bots.mjs';

function allSitesDiscoveredRun(seed) {
  const state = S.newRun(S.newMeta(), seed);
  for (const site of state.sites) Object.assign(site, { discovered: true, taken: true });
  state.resonance = 0;
  return state;
}

function placementAfterManage(seed) {
  const state = allSitesDiscoveredRun(seed);
  const simulationRng = state.rng;
  manage(state);
  return {
    placements: state.beings.map(({ id, placed, x, y }) => ({ id, placed, x, y })),
    simulationRng: state.rng,
    initialSimulationRng: simulationRng,
  };
}

test('manage fallback is deterministic per seeded run without consuming simulation RNG', () => {
  const first = placementAfterManage(741);
  manage(allSitesDiscoveredRun(9821));
  const second = placementAfterManage(741);

  assert.deepEqual(second.placements, first.placements, 'identical seeded fallback runs place beings identically');
  assert.equal(first.simulationRng, first.initialSimulationRng, 'bot fallback leaves the simulation RNG sequence alone');
  assert.equal(second.simulationRng, second.initialSimulationRng, 'an unrelated bot run has no effect on this run');
});
