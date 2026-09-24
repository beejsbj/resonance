import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../public/play/src/sim.js';
import { CENTER, GRID, BEINGS } from '../public/play/src/content.js';
import { pitchFor, chordAt, degreeToMidi } from '../public/play/src/harmony.js';

const run = (seed = 7) => S.newRun(S.newMeta(), seed);
const advance = (state, seconds, dt = 1 / 60) => { const events = []; for (let t = 0; t < seconds; t += dt) events.push(...S.step(state, dt)); return events; };

test('every tap earns, timing only adds a capped bonus', () => {
  const state = run();
  const before = state.resonance;
  state.tickPhase = S.tickSeconds(state) * 1.5; // mid-beat
  S.tap(state, { x: 20, y: 20 });
  assert.equal(state.resonance - before, S.touchYield(state));
  state.tick = GRID * 10; state.tickPhase = 0; // exactly on a beat
  const a = state.resonance; S.tap(state, { x: 20, y: 20 });
  const b = state.resonance; S.tap(state, { x: 20, y: 20 });
  assert.ok(b - a > S.touchYield(state), 'on-beat bonus');
  assert.equal(state.resonance - b, S.touchYield(state), 'one bonus per beat');
});

test('a tap on an enemy strikes it directly, without any instrument', () => {
  const state = run();
  state.beings.forEach(b => { b.placed = false; });
  state.enemies.push({ id: 'e1', type: 'drifter', x: 30, y: 30, hp: 12, maxHp: 12, slow: 0, engaged: null, attackClock: 0 });
  const result = S.tap(state, { x: 30, y: 30 });
  assert.equal(result.struck, true);
  assert.ok(state.enemies[0].hp < 12);
});

test('a tap on an own being accents and selects it rather than striking', () => {
  const state = run();
  const thread = state.beings[0];
  const result = S.tap(state, { x: thread.x, y: thread.y });
  assert.equal(result.select, thread.id);
  assert.equal(thread.accents, 2);
});

test('destroying a relay disconnects what lies beyond it; rebuilding reconnects with development intact', () => {
  const state = run();
  state.resonance = 10000;
  const pulse = state.beings[1];
  const thread = state.beings[0];
  thread.x = CENTER.x + 80; thread.y = CENTER.y; S.network(state);
  assert.ok(thread.linked);
  const spot = [0, 20, -20, 40, -40, 60, -60].map(dy => ({ x: CENTER.x + 140, y: CENTER.y + dy })).find(p => !S.placementReason(state, p.x, p.y, pulse.id) && Math.hypot(p.x - CENTER.x, p.y - CENTER.y) > S.conductorReach(state));
  assert.ok(spot, 'a free spot beyond conductor reach');
  assert.equal(S.place(state, pulse.id, spot.x, spot.y).ok, true, 'placed via relay');
  assert.ok(pulse.linked);
  S.develop(state, thread.id, 'mastery');
  thread.hp = 0; S.network(state);
  assert.equal(pulse.linked, false, 'outpost lost the pulse');
  assert.equal(S.rebuild(state, thread.id).ok, true);
  assert.equal(pulse.linked, true);
  assert.equal(thread.dev.mastery, 2);
});

test('disconnected wells yield half and keep what they earned', () => {
  const state = run();
  const well = { id: 'w', x: 10, y: 10, level: 1, hp: 40, maxHp: 40, linked: true };
  const a = S.wellYield(state, well);
  well.linked = false;
  assert.equal(S.wellYield(state, well), a / 2);
});

test('discovery, awakening, and placement are separate acts', () => {
  const state = run();
  state.resonance = 1000;
  const site = state.sites.find(s => s.kind === 'being' && s.discovered);
  assert.ok(site, 'a being sleeps within first reach');
  const before = state.beings.length;
  const result = S.awaken(state, site.id);
  assert.equal(result.ok, true);
  const being = state.beings.at(-1);
  assert.equal(state.beings.length, before + 1);
  assert.equal(being.placed, false, 'recruited, not yet arranged');
  assert.equal(being.identity, site.identity);
});

test('a being never changes identity through development', () => {
  const state = run();
  state.resonance = 1e6;
  const b = state.beings[0];
  for (const kind of ['mastery', 'subdivision', 'octave', 'reach']) for (let i = 0; i < 8; i++) S.develop(state, b.id, kind);
  assert.equal(b.identity, 'thread');
  assert.equal(S.beingStats(state, b).period, BEINGS.thread.period / 4);
});

test('beings play in the chord when linked', () => {
  const chord = chordAt(0).map(d => ((degreeToMidi(d) % 12) + 12) % 12);
  for (let step = 0; step < 8; step++) assert.ok(chord.includes(pitchFor('thread', 0, step) % 12));
});

test('waves start on their own, and time away advances wells but not danger', () => {
  const state = run();
  const events = advance(state, 40);
  assert.ok(events.some(e => e.type === 'waveStart'));
  assert.equal(state.phase, 'wave');
  const enemies = JSON.stringify(state.enemies);
  state.wells.push({ id: 'w', x: 10, y: 10, level: 2, hp: 40, maxHp: 40, linked: true, invested: 0 });
  const before = state.resonance;
  const earned = S.settleAway(state, 600);
  assert.ok(earned > 0 && state.resonance > before);
  assert.equal(JSON.stringify(state.enemies), enemies);
});

test('an unattended run eventually falls, and ends with echoes', () => {
  const state = run();
  let guard = 0;
  while (state.phase !== 'defeated' && guard++ < 60 * 60 * 30) S.step(state, 1 / 30);
  assert.equal(state.phase, 'defeated');
  const meta = S.newMeta();
  const echoes = S.endRun(state, meta);
  assert.ok(echoes > 0);
  assert.equal(meta.echoes, echoes);
});

test('attack events land exactly on the sixteenth grid when linked', () => {
  const state = run();
  const events = advance(state, 5).filter(e => e.type === 'play' && e.linked);
  assert.ok(events.length > 0);
  const tick = S.tickSeconds(state);
  for (const e of events) assert.ok(Math.abs(e.t / tick - Math.round(e.t / tick)) < 1e-6);
});
