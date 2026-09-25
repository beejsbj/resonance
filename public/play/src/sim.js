// Resonance simulation: DOM-free rules for one run. Actions mutate state in place and return events;
// timed events carry `t`, the exact simulation time of the beat they belong to, so sound can land on it.
import {
  W, H, CENTER, GRID, BEINGS, DEVELOPMENTS, ENEMIES, WELL, CONDUCTOR, GLOBAL, ECHOES, MOTIFS, MOTIF_WAVES,
  SITES, AWAKEN, REBUILD_SHARE, INTERLUDE, CRISIS_EVERY, OFFLINE_CAP,
} from './content.js';
import { pitchFor, strayPitch, tapPitch } from './harmony.js';

export const VERSION = 1;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ok = (message, events = [], extra = {}) => ({ ok: true, message, events, ...extra });
const no = message => ({ ok: false, message, events: [] });

function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

// ---------- meta (persists between runs) ----------

export function newMeta() {
  return { version: VERSION, echoes: 0, levels: Object.fromEntries(Object.keys(ECHOES).map(k => [k, 0])), bestWave: 0, runs: 0, known: ['thread', 'pulse'] };
}

export function echoCost(meta, key) {
  const def = ECHOES[key];
  const level = meta.levels[key] || 0;
  return level >= def.max ? Infinity : Math.round(def.base * Math.pow(def.growth, level));
}

export function buyEcho(meta, key) {
  const cost = echoCost(meta, key);
  if (!Number.isFinite(cost)) return no('Fully remembered.');
  if (meta.echoes < cost) return no('Not enough echoes.');
  meta.echoes -= cost; meta.levels[key] = (meta.levels[key] || 0) + 1;
  return ok(ECHOES[key].name + ' deepens.');
}

// ---------- a new run ----------

function makeSites(state) {
  const sites = [];
  let beingIndex = 0;
  for (const [ringIndex, ring] of SITES.rings.entries()) {
    const offset = random(state) * Math.PI * 2;
    const n = ring.contents.length;
    ring.contents.forEach((kind, i) => {
      const angle = offset + (i / n) * Math.PI * 2 + (random(state) - 0.5) * (Math.PI / n) * 0.7;
      const r = ring.radius * (0.92 + random(state) * 0.16);
      // Portrait arena: the ellipse is narrower than it is tall.
      const x = clamp(CENTER.x + Math.cos(angle) * r * 0.72, 22, W - 22);
      const y = clamp(CENTER.y + Math.sin(angle) * r, 26, H - 26);
      const site = { id: 's' + state.nextId++, x, y, kind, ring: ringIndex, discovered: false, taken: false };
      if (kind === 'being') site.identity = SITES.beingOrder[beingIndex++ % SITES.beingOrder.length];
      sites.push(site);
    });
  }
  return sites;
}

function makeBeing(state, identity, invested) {
  const def = BEINGS[identity];
  return { id: 'b' + state.nextId++, identity, dev: { mastery: 1, subdivision: 0, octave: 0, reach: 0 }, placed: false, x: 0, y: 0, hp: def.hp, maxHp: def.hp, invested, accents: 0, settle: 0, steps: 0, linked: false, ensemble: 0 };
}

export function newRun(meta, seed = (Date.now() >>> 0)) {
  const e = meta.levels;
  const state = {
    version: VERSION, rng: seed >>> 0 || 1, nextId: 1,
    time: 0, tick: 0, tickPhase: 0,
    resonance: 30 + 25 * (e.headStart || 0), lifetime: 0,
    globals: { touch: 0, tempo: 0, reach: 0, breath: 0 },
    echo: { ...e },
    conductor: { hp: CONDUCTOR.hp + 20 * (e.resolve || 0), maxHp: CONDUCTOR.hp + 20 * (e.resolve || 0), power: CONDUCTOR.power, chorus: 0, singCooldown: 0, ward: null, lastBonusBeat: -1 },
    motifs: [], motifOffer: null, gustEcho: null,
    sites: [], wells: [], beings: [], enemies: [], boss: null,
    phase: 'interlude', interlude: INTERLUDE.first, wave: 0, toSpawn: [], spawnClock: 0, fronts: [],
    paused: false, stats: { kills: 0, bosses: 0, taps: 0 },
  };
  state.sites = makeSites(state);
  const first = makeBeing(state, 'thread', 20);
  Object.assign(first, { placed: true, x: CENTER.x + 46, y: CENTER.y - 20 });
  state.beings.push(first, makeBeing(state, 'pulse', 20));
  network(state);
  return state;
}

// ---------- derived numbers ----------

export const bpm = state => 92 + 5 * state.globals.tempo;
export const beatSeconds = state => 60 / bpm(state);
export const tickSeconds = state => beatSeconds(state) / GRID;
export const conductorReach = state => CONDUCTOR.reach + 16 * state.globals.reach + 10 * (state.echo.widePulse || 0);
export const touchYield = state => 1 + state.globals.touch + (state.echo.steadyHand || 0);
export const strikeDamage = state => 5 + 3 * state.globals.touch;
const powerRegen = state => CONDUCTOR.regen * (1 + 0.25 * state.globals.breath);
const has = (state, motif) => state.motifs.includes(motif);

export function beingStats(state, being) {
  const def = BEINGS[being.identity];
  const { mastery, subdivision, octave, reach } = being.dev;
  return {
    damage: def.damage * (1 + 0.45 * (mastery - 1)) * (1 + 0.25 * octave),
    range: def.range + 12 * reach,
    relay: def.relay + 18 * reach + (has(state, 'longPulse') ? 20 : 0),
    period: Math.max(1, def.period / Math.pow(2, subdivision)),
    maxHp: Math.round(def.hp * (1 + 0.3 * (mastery - 1))),
    targets: (def.targets || 1) + Math.floor((mastery - 1) / 3),
  };
}

export function wellYield(state, well) {
  const base = WELL.yield * well.level * (1 + 0.12 * (state.echo.deepWells || 0));
  return base * (well.linked ? 1 : 0.5) * (state.conductor.chorus > 0 ? 1.25 : 1);
}

export function incomePerSecond(state) {
  const barSeconds = beatSeconds(state) * 4;
  const perBar = state.wells.filter(w => w.hp > 0).reduce((s, w) => s + wellYield(state, w) * (has(state, 'doubleWells') ? 1.5 : 1), 0);
  return perBar / barSeconds;
}

// ---------- the pulse network ----------
// The conductor's pulse spreads through placed, living beings. Anything outside every linked circle
// keeps acting, but uncoordinated: beings stray off the beat and the chord, wells yield half.

export function network(state) {
  const relays = [{ x: CENTER.x, y: CENTER.y, r: conductorReach(state), id: 'conductor' }];
  const placed = state.beings.filter(b => b.placed && b.hp > 0);
  const before = new Map(state.beings.map(b => [b.id, b.linked]).concat(state.wells.map(w => [w.id, w.linked])));
  for (const b of state.beings) { b.linked = false; b.parent = null; }
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of placed) {
      if (b.linked) continue;
      const via = relays.find(r => dist(r, b) <= r.r);
      if (via) { b.linked = true; b.parent = via.id; relays.push({ x: b.x, y: b.y, r: beingStats(state, b).relay, id: b.id }); grew = true; }
    }
  }
  const covered = p => relays.some(r => dist(r, p) <= r.r);
  for (const w of state.wells) { const via = relays.find(r => dist(r, w) <= r.r); w.linked = w.hp > 0 && !!via; w.parent = via ? via.id : null; }
  const found = [];
  for (const s of state.sites) if (!s.discovered && covered(s)) { s.discovered = true; found.push(s.id); }
  // Ensemble: distinct neighbouring identities that share the pulse strengthen each other.
  for (const b of placed) {
    const reach = beingStats(state, b).relay;
    const kinds = new Set(placed.filter(o => o !== b && o.linked && b.linked && o.identity !== b.identity && dist(o, b) <= reach).map(o => o.identity));
    b.ensemble = Math.min(3, kinds.size);
  }
  const changed = [];
  for (const x of state.beings.concat(state.wells)) if (before.has(x.id) && before.get(x.id) !== x.linked && (x.placed !== false)) changed.push({ id: x.id, linked: x.linked });
  state.relays = relays;
  return { relays, found, changed };
}

export const isCovered = (state, p) => (state.relays || network(state).relays).some(r => dist(r, p) <= r.r);

// ---------- costs ----------

export const awakenCost = state => Math.round(AWAKEN.base * Math.pow(AWAKEN.growth, state.beings.length - 2));
export const wellBuildCost = state => Math.round(WELL.buildBase * Math.pow(WELL.buildGrowth, state.wells.length));
export const wellUpgradeCost = well => well.level >= WELL.max ? Infinity : Math.round(WELL.upgradeBase * Math.pow(WELL.upgradeGrowth, well.level));
export function devCost(being, kind) {
  const def = DEVELOPMENTS[kind];
  const level = being.dev[kind];
  const max = kind === 'subdivision' ? BEINGS[being.identity].subMax : def.max;
  const steps = kind === 'mastery' ? level - 1 : level;
  if ((kind === 'mastery' && level >= max) || (kind !== 'mastery' && level >= max)) return Infinity;
  return Math.round(def.base * Math.pow(def.growth, steps) * BEINGS[being.identity].costScale);
}
export const globalCost = (state, key) => state.globals[key] >= GLOBAL[key].max ? Infinity : Math.round(GLOBAL[key].base * Math.pow(GLOBAL[key].growth, state.globals[key]));
export const rebuildCost = (state, thing) => Math.max(8, Math.ceil((thing.invested || 20) * REBUILD_SHARE * (has(state, 'kindRepair') ? 0.5 : 1)));

function spend(state, cost) {
  if (!Number.isFinite(cost) || state.resonance < cost) return false;
  state.resonance -= cost; return true;
}
function earn(state, amount) { state.resonance += amount; state.lifetime += amount; }

// ---------- building, recruiting, arranging, developing ----------

export function placementReason(state, x, y, ignoreId) {
  if (x < 16 || x > W - 16 || y < 16 || y > H - 16) return 'Keep inside the arena.';
  if (dist({ x, y }, CENTER) < 32) return 'Leave the conductor room.';
  if (!isCovered(state, { x, y })) return 'Beings can only join where the pulse reaches.';
  for (const b of state.beings) if (b.placed && b.id !== ignoreId && dist(b, { x, y }) < 24) return 'Too close to another being.';
  for (const w of state.wells) if (dist(w, { x, y }) < 24) return 'Too close to a well.';
  for (const s of state.sites) if (!s.taken && dist(s, { x, y }) < 22) return 'Something sleeps there.';
  return '';
}

export function place(state, beingId, x, y) {
  const being = state.beings.find(b => b.id === beingId);
  if (!being) return no('No such being.');
  if (being.hp <= 0) return no('Rebuild it first.');
  const reason = placementReason(state, x, y, being.id);
  if (reason) return no(reason);
  Object.assign(being, { placed: true, x, y, settle: GRID });
  const net = network(state);
  return ok(BEINGS[being.identity].name + ' joins the orchestra.', [{ type: 'placed', id: being.id, x, y, identity: being.identity }, ...foundEvents(state, net)]);
}

export function lift(state, beingId) {
  const being = state.beings.find(b => b.id === beingId && b.placed);
  if (!being) return no('Not in the orchestra.');
  if (being.hp <= 0) return no('A silent being must be rebuilt before it can move.');
  being.placed = false;
  const net = network(state);
  return ok(BEINGS[being.identity].name + ' steps out of the arrangement.', [{ type: 'lifted', id: being.id }, ...linkEvents(net)]);
}

export function awaken(state, siteId) {
  const site = state.sites.find(s => s.id === siteId);
  if (!site || site.kind !== 'being' || site.taken) return no('Nothing sleeps here.');
  if (!site.discovered || !isCovered(state, site)) return no('The pulse must reach it first.');
  const cost = awakenCost(state);
  if (!spend(state, cost)) return no('Awakening needs ' + cost + ' Resonance.');
  site.taken = true;
  const being = makeBeing(state, site.identity, cost);
  state.beings.push(being);
  network(state);
  return ok('A ' + BEINGS[site.identity].name + ' awakens. Place it where it should play.', [{ type: 'awakened', x: site.x, y: site.y, identity: site.identity, id: being.id }], { newIdentity: site.identity, beingId: being.id });
}

export function buildWell(state, siteId) {
  const site = state.sites.find(s => s.id === siteId);
  if (!site || site.kind !== 'well' || site.taken) return no('This site cannot hold a well.');
  if (!site.discovered) return no('The pulse must reach it first.');
  const cost = wellBuildCost(state);
  if (!spend(state, cost)) return no('A well here needs ' + cost + ' Resonance.');
  site.taken = true;
  const well = { id: 'w' + state.nextId++, siteId, x: site.x, y: site.y, level: 1, hp: WELL.hp, maxHp: WELL.hp, invested: cost, linked: false };
  state.wells.push(well);
  network(state);
  return ok(well.linked ? 'The well begins to sing on the bar.' : 'The well sings, but faintly: the pulse does not reach it.', [{ type: 'wellBuilt', id: well.id, x: well.x, y: well.y }], { wellId: well.id });
}

export function upgradeWell(state, wellId) {
  const well = state.wells.find(w => w.id === wellId);
  if (!well) return no('No such well.');
  if (well.hp <= 0) return no('Rebuild the well first.');
  const cost = wellUpgradeCost(well);
  if (!Number.isFinite(cost)) return no('This well is as deep as it goes.');
  if (!spend(state, cost)) return no('Deepening needs ' + cost + ' Resonance.');
  well.level += 1; well.invested += cost; well.maxHp += 6; well.hp += 6;
  return ok('The well deepens to level ' + well.level + '.', [{ type: 'wellUp', id: well.id, x: well.x, y: well.y }]);
}

export function develop(state, beingId, kind) {
  const being = state.beings.find(b => b.id === beingId);
  if (!being || !DEVELOPMENTS[kind]) return no('Choose a being.');
  if (being.hp <= 0) return no('Rebuild it first.');
  const cost = devCost(being, kind);
  if (!Number.isFinite(cost)) return no('That development is complete.');
  if (!spend(state, cost)) return no('Needs ' + cost + ' Resonance.');
  being.dev[kind] += 1; being.invested += cost;
  const stats = beingStats(state, being);
  being.hp += stats.maxHp - being.maxHp; being.maxHp = stats.maxHp;
  const net = network(state);
  return ok(BEINGS[being.identity].name + ' ' + DEVELOPMENTS[kind].verb + '.', [{ type: 'developed', id: being.id, kind, x: being.x, y: being.y }, ...foundEvents(state, net)]);
}

export function rebuild(state, id) {
  const thing = state.beings.find(b => b.id === id) || state.wells.find(w => w.id === id);
  if (!thing || thing.hp > 0) return no('Nothing to rebuild.');
  const cost = rebuildCost(state, thing);
  if (!spend(state, cost)) return no('Rebuilding needs ' + cost + ' Resonance.');
  thing.hp = thing.maxHp;
  const net = network(state);
  return ok('It returns with everything it had learned.', [{ type: 'rebuilt', id, x: thing.x, y: thing.y }, ...linkEvents(net)]);
}

export function buyGlobal(state, key) {
  if (!GLOBAL[key]) return no('Unknown.');
  const cost = globalCost(state, key);
  if (!Number.isFinite(cost)) return no(GLOBAL[key].name + ' is complete.');
  if (!spend(state, cost)) return no('Needs ' + cost + ' Resonance.');
  state.globals[key] += 1;
  const net = network(state);
  const msg = key === 'tempo' ? 'The orchestra rises to ' + bpm(state) + ' BPM.' : GLOBAL[key].name + ' grows.';
  return ok(msg, [{ type: 'global', key }, ...foundEvents(state, net)]);
}

export function chooseMotif(state, id) {
  if (!state.motifOffer || !state.motifOffer.includes(id)) return no('That motif is not on offer.');
  state.motifs.push(id); state.motifOffer = null;
  network(state);
  return ok(MOTIFS[id].name + ' joins this performance.', [{ type: 'motif', id }]);
}

export function callWave(state) {
  if (state.phase !== 'interlude') return no('Not now.');
  if (state.motifOffer) return no('Choose a motif first.');
  const bonus = Math.floor(state.interlude * 1.2 * (1 + state.wave * 0.1));
  earn(state, bonus);
  state.interlude = 0;
  return ok(bonus ? 'Called early: +' + bonus + ' Resonance.' : 'The next movement begins.', []);
}

function foundEvents(state, net) {
  return net.found.map(id => { const s = state.sites.find(x => x.id === id); return { type: 'found', id, x: s.x, y: s.y, kind: s.kind, identity: s.identity }; }).concat(linkEvents(net));
}
function linkEvents(net) { return net.changed.map(c => ({ type: c.linked ? 'reconnected' : 'disconnected', id: c.id })); }

// ---------- conductor powers ----------

// `lag` is how long ago the moment being judged was: the beat a player hears left the simulation earlier.
function nearestBeat(state, lag = 0) {
  const beat = beatSeconds(state);
  const beatPos = (state.tick + state.tickPhase / tickSeconds(state)) / GRID - lag / beat;
  const nearest = Math.round(beatPos);
  return { nearest, error: Math.abs(beatPos - nearest) * beat, beat };
}

// `lag`: seconds between the moment the finger came down, in the time of what the player heard, and now.
export function tap(state, p, lag = 0) {
  const events = [];
  state.stats.taps += 1;
  const { nearest, error, beat } = nearestBeat(state, clamp(lag, 0, 0.5));
  const onBeat = error <= beat * 0.12 && state.conductor.lastBonusBeat !== nearest;
  if (onBeat) state.conductor.lastBonusBeat = nearest;
  const base = touchYield(state);
  const amount = base + (onBeat ? Math.max(1, Math.round(base * 0.6)) : 0);
  earn(state, amount);
  const bar = Math.floor(state.tick / (GRID * 4));
  events.push({ type: 'tap', t: state.time, x: p.x, y: p.y, amount, onBeat, midi: tapPitch(bar, p.x, W) });

  // One touch, one intention: an enemy under the finger is struck; otherwise an own being is accented.
  const radius = has(state, 'beatChorus') && onBeat ? 64 : CONDUCTOR.strikeRadius;
  const victims = state.enemies.filter(e => e.hp > 0 && dist(e, p) <= radius + ENEMIES[e.type].radius);
  const bossHit = state.boss && state.boss.hp > 0 && dist(state.boss, p) <= radius + 26;
  if (victims.length || bossHit) {
    if (!onBeat && !spendPower(state, CONDUCTOR.strikeCost)) return ok('Out of breath: the tap still gathers, but cannot strike.', events, { struck: false });
    const damage = strikeDamage(state) * (onBeat ? 1.5 : 1);
    for (const e of victims) hurtEnemy(state, e, damage, events);
    if (bossHit) hurtBoss(state, damage, events);
    events.push({ type: 'strike', t: state.time, x: p.x, y: p.y, radius, onBeat, hits: victims.length + (bossHit ? 1 : 0) });
    return ok('', events, { struck: true });
  }
  const being = state.beings.filter(b => b.placed && b.hp > 0 && dist(b, p) <= 22).sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (being) {
    const selected = { select: being.id };
    if (!spendPower(state, CONDUCTOR.accentCost)) return ok('', events, selected);
    const accented = [being];
    if (has(state, 'sympathy')) for (const o of state.beings) if (o !== being && o.placed && o.hp > 0 && o.linked && dist(o, being) <= beingStats(state, being).relay) accented.push(o);
    for (const b of accented) b.accents = 2;
    events.push({ type: 'accent', t: state.time, ids: accented.map(b => b.id), x: being.x, y: being.y });
    return ok('', events, selected);
  }
  const hurt = state.beings.find(b => b.placed && b.hp <= 0 && dist(b, p) <= 22);
  if (hurt) return ok('', events, { select: hurt.id });
  const well = state.wells.find(w => dist(w, p) <= 20);
  if (well) return ok('', events, { select: well.id });
  const site = state.sites.find(s => s.discovered && !s.taken && dist(s, p) <= 20);
  if (site) return ok('', events, { select: site.id });
  return ok('', events, { select: null });
}

function spendPower(state, amount) {
  if (state.conductor.power < amount) return false;
  state.conductor.power -= amount; return true;
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function gust(state, a, b, strength, events) {
  const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  let pushed = 0;
  for (const e of state.enemies) if (segmentDistance(e, a, b) < 40) {
    e.x = clamp(e.x + ux * 52 * strength, -30, W + 30); e.y = clamp(e.y + uy * 52 * strength, -30, H + 30);
    e.slow = Math.max(e.slow, 2 * strength); e.engaged = null; pushed++;
  }
  if (state.boss && state.boss.shell && segmentDistance(state.boss, a, b) < 70) {
    // Breaking the shell by hand does more than wait it out: the Hush is left exposed.
    state.boss.shell = false; state.boss.broken = true; state.boss.exposed = 6;
    events.push({ type: 'bossBreak', t: state.time, x: state.boss.x, y: state.boss.y });
  }
  events.push({ type: 'gust', t: state.time, a, b, strength, pushed });
}

export function swipe(state, a, b) {
  if (!spendPower(state, CONDUCTOR.gustCost)) return no('A gust needs ' + CONDUCTOR.gustCost + ' power.');
  const events = [];
  gust(state, a, b, 1, events);
  if (has(state, 'echoGust')) state.gustEcho = { a, b, at: state.time + beatSeconds(state) };
  return ok('', events);
}

export function hold(state, p, seconds) {
  if (!spendPower(state, CONDUCTOR.wardDrain * seconds)) { state.conductor.ward = null; return no('The conductor needs a breath.'); }
  state.conductor.ward = { x: p.x, y: p.y, r: 60, until: state.time + 0.3 + (has(state, 'lingerWard') ? 2 : 0) };
  return ok('', [{ type: 'ward', t: state.time, x: p.x, y: p.y }]);
}

export function sing(state) {
  const c = state.conductor;
  if (c.singCooldown > 0) return no('The voice is still echoing.');
  if (!spendPower(state, CONDUCTOR.singCost)) return no('Singing needs ' + CONDUCTOR.singCost + ' power.');
  c.chorus = CONDUCTOR.singLength; c.singCooldown = CONDUCTOR.singCooldown;
  return ok('The conductor sings: the orchestra and wells swell.', [{ type: 'sing', t: state.time }]);
}

// ---------- combat ----------

function hurtEnemy(state, e, amount, events) {
  if (e.hp <= 0) return;
  e.hp -= Math.max(1, amount - (ENEMIES[e.type].armor || 0));
  if (e.hp <= 0) {
    const reward = ENEMIES[e.type].reward * (1 + 0.08 * state.wave) * (has(state, 'harvest') ? 2 : 1);
    earn(state, reward); state.stats.kills += 1;
    events.push({ type: 'kill', t: state.time, x: e.x, y: e.y, enemy: e.type, reward });
  }
}

function hurtBoss(state, amount, events) {
  const boss = state.boss;
  if (!boss || boss.hp <= 0 || boss.shell) return;
  boss.hp -= amount * (boss.exposed > 0 ? 1.6 : 1);
  if (!boss.broken && !boss.shell && boss.hp <= boss.maxHp / 2) { boss.shell = true; boss.shellClock = 14; events.push({ type: 'bossShell', t: state.time, x: boss.x, y: boss.y }); }
  if (boss.hp <= 0) {
    state.stats.bosses += 1;
    const reward = 40 + state.wave * 8;
    earn(state, reward);
    // The defeated Hush becomes music: a new being sleeps where it fell.
    const identities = Object.keys(BEINGS);
    const site = { id: 's' + state.nextId++, x: clamp(boss.x, 30, W - 30), y: clamp(boss.y, 30, H - 30), kind: 'being', ring: 3, identity: identities[Math.floor(random(state) * identities.length)], discovered: false, taken: false };
    state.sites.push(site);
    events.push({ type: 'bossDown', t: state.time, x: boss.x, y: boss.y, reward, identity: site.identity });
    state.boss = null;
    const net = network(state);
    events.push(...foundEvents(state, net));
  }
}

function targetsFor(state, being, stats) {
  const inRange = state.enemies.filter(e => e.hp > 0 && dist(e, being) <= stats.range).sort((a, b) => dist(a, CENTER) - dist(b, CENTER));
  const boss = state.boss && state.boss.hp > 0 && !state.boss.shell && dist(state.boss, being) <= stats.range + 26 ? state.boss : null;
  return { inRange, boss };
}

function attack(state, being, t, events) {
  const def = BEINGS[being.identity];
  const stats = beingStats(state, being);
  const { inRange, boss } = targetsFor(state, being, stats);
  const combat = inRange.length > 0 || !!boss;
  const accent = being.accents > 0 && combat;
  let damage = stats.damage * (1 + 0.12 * being.ensemble) * (state.conductor.chorus > 0 ? 1.25 : 1) * (being.linked ? 1 : 0.75) * (accent ? 1.6 : 1);
  if (accent) being.accents -= 1;
  const hits = [];
  if (combat) {
    if (def.aura) {
      for (const e of inRange) { hurtEnemy(state, e, damage, events); hits.push({ x: e.x, y: e.y }); }
      if (boss) { hurtBoss(state, damage, events); hits.push({ x: boss.x, y: boss.y }); }
    } else if (def.splash) {
      const primary = inRange[0] || boss;
      for (const e of state.enemies) if (e.hp > 0 && dist(e, primary) <= def.splash + 6 * (being.dev.mastery - 1)) { hurtEnemy(state, e, damage, events); hits.push({ x: e.x, y: e.y }); }
      if (boss && dist(boss, primary) <= def.splash + 26) hurtBoss(state, damage, events);
      hits.unshift({ x: primary.x, y: primary.y });
    } else if (def.chain) {
      let current = inRange[0] || boss;
      const struck = new Set();
      for (let i = 0; i < def.chain + Math.floor((being.dev.mastery - 1) / 2) && current; i++) {
        struck.add(current); hits.push({ x: current.x, y: current.y });
        if (current === boss) hurtBoss(state, damage, events); else hurtEnemy(state, current, damage, events);
        damage *= 0.72;
        const from = current;
        current = state.enemies.filter(e => e.hp > 0 && !struck.has(e) && dist(e, from) <= 52).sort((a, b) => dist(a, from) - dist(b, from))[0];
      }
    } else {
      const list = inRange.slice(0, stats.targets);
      if (boss && list.length < stats.targets) list.push(boss);
      for (const e of list) { if (e === boss) hurtBoss(state, damage, events); else hurtEnemy(state, e, damage, events); hits.push({ x: e.x, y: e.y }); }
    }
  }
  // Every being keeps playing between waves, quietly: the base is a performance even when nothing threatens it.
  const bar = Math.floor(state.tick / (GRID * 4));
  const step = being.steps++;
  const midi = being.linked ? pitchFor(def.voice, bar, step, being.id.length) : strayPitch(def.voice, random(state));
  const midis = [midi];
  if (being.dev.octave >= 1) midis.push(midi + 12);
  if (being.dev.octave >= 2) midis.push(midi - 12);
  const jitter = being.linked ? 0 : random(state) * 0.07;
  events.push({ type: 'play', t: t + jitter, id: being.id, identity: being.identity, x: being.x, y: being.y, midis, hits, combat, accent, linked: being.linked, detune: being.linked ? 0 : (random(state) - 0.5) * 50 });
}

function onTick(state, t, events) {
  const tick = state.tick;
  if (tick % GRID === 0) events.push({ type: 'beat', t, beat: tick / GRID });
  if (tick % (GRID * 4) === 0) events.push({ type: 'bar', t, bar: tick / (GRID * 4) });
  const bar = Math.floor(tick / (GRID * 4));
  const payWells = share => {
    for (const w of state.wells) if (w.hp > 0) {
      const amount = wellYield(state, w) * share;
      earn(state, amount);
      events.push({ type: 'wellPay', t, id: w.id, x: w.x, y: w.y, amount, linked: w.linked, midi: pitchFor('well', bar, w.level, 0) });
    }
  };
  if (tick % (GRID * 4) === 0) payWells(1);
  if (has(state, 'doubleWells') && tick % (GRID * 4) === GRID * 2) payWells(0.5);
  const inCombat = state.phase === 'wave';
  for (const b of state.beings) {
    if (!b.placed || b.hp <= 0) continue;
    if (b.settle > 0) { b.settle--; continue; }
    const period = beingStats(state, b).period;
    if (tick % period !== 0) continue;
    // Uncoordinated beings drop every other entrance.
    if (!b.linked && random(state) < 0.5) continue;
    const hasTarget = inCombat && (state.enemies.length || state.boss);
    // Between waves, quieter: only entrances that land on the beat.
    if (!hasTarget && tick % GRID !== 0 && period < GRID) continue;
    attack(state, b, t, events);
  }
}

// ---------- waves ----------

function spawnPoint(state, angle) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const tx = dx > 0 ? (W + 14 - CENTER.x) / dx : (-14 - CENTER.x) / dx;
  const ty = dy > 0 ? (H + 14 - CENTER.y) / dy : (-14 - CENTER.y) / dy;
  const s = Math.min(Math.abs(tx), Math.abs(ty));
  return { x: CENTER.x + dx * s, y: CENTER.y + dy * s };
}

export function waveComposition(wave) {
  const count = 6 + Math.floor(wave * 2.2);
  const darters = wave >= 3 ? Math.floor(count * Math.min(0.35, 0.12 + wave * 0.02)) : 0;
  const shells = wave >= 5 ? Math.floor(count * Math.min(0.3, 0.08 + wave * 0.012)) : 0;
  return { drifter: count - darters - shells, darter: darters, shell: shells };
}

function startWave(state, events) {
  state.wave += 1;
  state.phase = 'wave';
  const comp = waveComposition(state.wave);
  const crisis = state.wave % CRISIS_EVERY === 0;
  const list = [];
  for (const [type, n] of Object.entries(comp)) for (let i = 0; i < Math.ceil(n * (crisis ? 0.5 : 1)); i++) list.push(type);
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(random(state) * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  state.toSpawn = list;
  state.spawnClock = 0.4;
  const frontCount = 1 + Math.min(2, Math.floor(state.wave / 4));
  state.fronts = Array.from({ length: frontCount }, () => random(state) * Math.PI * 2);
  events.push({ type: 'waveStart', t: state.time, wave: state.wave, crisis, fronts: state.fronts.slice() });
  if (crisis) {
    const angle = state.fronts[0];
    const p = spawnPoint(state, angle);
    const hp = Math.round(420 * Math.pow(1.35, state.wave / CRISIS_EVERY - 1));
    state.boss = { x: p.x, y: p.y, hp, maxHp: hp, shell: false, broken: false, sweepClock: 9, telegraph: 0, angle: 0, aimed: false, spawnClock: 6 };
    events.push({ type: 'crisis', t: state.time, x: p.x, y: p.y });
  }
}

function spawn(state, type) {
  const front = state.fronts[Math.floor(random(state) * state.fronts.length)];
  const p = spawnPoint(state, front + (random(state) - 0.5) * 0.8);
  const def = ENEMIES[type];
  const hp = Math.ceil(def.hp * Math.pow(1.18, state.wave - 1));
  state.enemies.push({ id: 'e' + state.nextId++, type, x: p.x, y: p.y, hp, maxHp: hp, slow: 0, engaged: null, attackClock: 0 });
}

function structures(state) {
  return state.beings.filter(b => b.placed && b.hp > 0).concat(state.wells.filter(w => w.hp > 0));
}

function damageStructure(state, s, amount, events) {
  const ward = state.conductor.ward;
  const shielded = ward && dist(ward, s) <= ward.r;
  s.hp = Math.max(0, s.hp - amount * (shielded ? 0.2 : 1));
  events.push({ type: 'hit', t: state.time, id: s.id, x: s.x, y: s.y, shielded: !!shielded });
  if (s.hp <= 0) {
    const net = network(state);
    events.push({ type: 'down', t: state.time, id: s.id, x: s.x, y: s.y, kind: s.identity ? 'being' : 'well', identity: s.identity }, ...linkEvents(net));
  }
}

function moveEnemies(state, dt, events) {
  const live = structures(state);
  const drones = state.beings.filter(b => b.placed && b.hp > 0 && BEINGS[b.identity].aura);
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const def = ENEMIES[e.type];
    e.slow = Math.max(0, e.slow - dt);
    let slowFactor = e.slow > 0 ? 0.55 : 1;
    for (const d of drones) if (dist(d, e) <= beingStats(state, d).range) slowFactor = Math.min(slowFactor, 1 - BEINGS.drone.slow * (d.linked ? 1 : 0.5));
    const contact = live.find(s => s.hp > 0 && dist(s, e) <= def.radius + 12);
    if (contact) {
      e.attackClock += dt;
      if (e.attackClock >= 1) { e.attackClock -= 1; damageStructure(state, contact, def.dps, events); }
      continue;
    }
    let goal = CENTER;
    if (def.siege) { const nearest = live.slice().sort((a, b) => dist(a, e) - dist(b, e))[0]; if (nearest) goal = nearest; }
    const d = Math.max(1, dist(e, goal));
    const speed = def.speed * slowFactor;
    e.x += (goal.x - e.x) / d * speed * dt;
    e.y += (goal.y - e.y) / d * speed * dt;
    if (dist(e, CENTER) < 20) {
      state.conductor.hp = Math.max(0, state.conductor.hp - def.strike);
      e.hp = 0;
      events.push({ type: 'conductorHit', t: state.time, amount: def.strike, x: e.x, y: e.y });
    }
  }
  state.enemies = state.enemies.filter(e => e.hp > 0);
}

function updateBoss(state, dt, events) {
  const boss = state.boss;
  if (!boss) return;
  boss.exposed = Math.max(0, (boss.exposed || 0) - dt);
  if (boss.shell) { boss.shellClock -= dt; if (boss.shellClock <= 0) { boss.shell = false; boss.broken = true; events.push({ type: 'bossBreak', t: state.time, x: boss.x, y: boss.y, waited: true }); } }
  const gap = dist(boss, CENTER);
  if (gap > 118) { const speed = boss.shell ? 5 : 8; boss.x += (CENTER.x - boss.x) / gap * speed * dt; boss.y += (CENTER.y - boss.y) / gap * speed * dt; }
  else { state.conductor.hp = Math.max(0, state.conductor.hp - 1.5 * dt); }
  boss.spawnClock -= dt;
  if (boss.spawnClock <= 0) { boss.spawnClock = 7; for (let i = 0; i < 3; i++) { const e = { id: 'e' + state.nextId++, type: 'drifter', x: boss.x + (random(state) - 0.5) * 30, y: boss.y + (random(state) - 0.5) * 30, hp: Math.ceil(ENEMIES.drifter.hp * Math.pow(1.18, state.wave - 1)), slow: 0, engaged: null, attackClock: 0 }; e.maxHp = e.hp; state.enemies.push(e); } }
  boss.sweepClock -= dt;
  if (boss.sweepClock <= 3 && !boss.aimed) {
    // Aim the sweep at the densest part of the orchestra, and warn three seconds ahead: a moment for the conductor.
    const live = structures(state);
    const aim = live.length ? live[Math.floor(random(state) * live.length)] : { x: boss.x, y: boss.y };
    boss.angle = Math.atan2(aim.y - CENTER.y, aim.x - CENTER.x);
    boss.telegraph = 3; boss.aimed = true;
    events.push({ type: 'sweepWarn', t: state.time, angle: boss.angle });
  }
  if (boss.telegraph > 0) boss.telegraph -= dt;
  if (boss.sweepClock <= 0) {
    boss.sweepClock = boss.shell ? 8 : 11; boss.telegraph = 0; boss.aimed = false;
    for (const s of structures(state)) {
      const a = Math.atan2(s.y - CENTER.y, s.x - CENTER.x);
      if (Math.abs(Math.atan2(Math.sin(a - boss.angle), Math.cos(a - boss.angle))) < 0.6) damageStructure(state, s, 26, events);
    }
    events.push({ type: 'sweep', t: state.time, angle: boss.angle });
  }
}

function finishWave(state, events) {
  if (state.toSpawn.length || state.enemies.length || state.boss) return;
  const reward = 8 + state.wave * 3;
  earn(state, reward);
  state.phase = 'interlude';
  state.interlude = INTERLUDE.normal;
  state.conductor.ward = null;
  events.push({ type: 'waveClear', t: state.time, wave: state.wave, reward });
  if (MOTIF_WAVES.includes(state.wave)) {
    const pool = Object.keys(MOTIFS).filter(m => !state.motifs.includes(m));
    const offer = [];
    while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(random(state) * pool.length), 1)[0]);
    if (offer.length) { state.motifOffer = offer; events.push({ type: 'motifOffer', t: state.time, offer }); }
  }
}

// ---------- time ----------

export function step(state, seconds) {
  const events = [];
  if (state.paused || state.phase === 'defeated') return events;
  const dt = clamp(seconds, 0, 0.1);
  state.time += dt;
  const c = state.conductor;
  c.power = Math.min(CONDUCTOR.power, c.power + powerRegen(state) * dt);
  c.chorus = Math.max(0, c.chorus - dt);
  c.singCooldown = Math.max(0, c.singCooldown - dt);
  if (c.ward && c.ward.until < state.time) c.ward = null;
  if (state.gustEcho && state.time >= state.gustEcho.at) { gust(state, state.gustEcho.a, state.gustEcho.b, 0.5, events); state.gustEcho = null; }

  state.tickPhase += dt;
  const tickSec = tickSeconds(state);
  while (state.tickPhase >= tickSec) {
    state.tickPhase -= tickSec;
    state.tick += 1;
    onTick(state, state.time - state.tickPhase, events);
  }

  if (state.phase === 'interlude') {
    state.interlude -= dt;
    if (state.interlude <= 0) {
      // An unanswered offer never stalls idle play: the first motif is taken when the movement begins.
      if (state.motifOffer) { const id = state.motifOffer[0]; state.motifs.push(id); state.motifOffer = null; network(state); events.push({ type: 'motif', t: state.time, id, auto: true }); }
      startWave(state, events);
    }
  } else if (state.phase === 'wave') {
    state.spawnClock -= dt;
    if (state.toSpawn.length && state.spawnClock <= 0) { spawn(state, state.toSpawn.shift()); state.spawnClock = Math.max(0.28, 1.05 - state.wave * 0.04); }
    moveEnemies(state, dt, events);
    updateBoss(state, dt, events);
    finishWave(state, events);
  }
  if (c.hp <= 0 && state.phase !== 'defeated') { state.phase = 'defeated'; events.push({ type: 'defeat', t: state.time, wave: state.wave }); }
  return events;
}

// Time away: wells keep singing (at the connection they had), danger waits. A wave left mid-way waits
// whole, conductor included, so stepping away is never a way to catch a breath in a fight.
export function settleAway(state, seconds) {
  const s = clamp(seconds, 0, OFFLINE_CAP);
  if (state.phase === 'defeated' || s < 1) return 0;
  const earned = incomePerSecond({ ...state, conductor: { ...state.conductor, chorus: 0 } }) * s;
  earn(state, earned);
  const c = state.conductor;
  if (state.phase !== 'wave') { c.power = CONDUCTOR.power; c.singCooldown = Math.max(0, c.singCooldown - s); c.chorus = 0; }
  c.ward = null;
  return earned;
}

export function echoesFor(state) {
  return Math.floor(state.wave * 1.5 + state.stats.bosses * 4 + Math.pow(state.lifetime, 0.35) / 2);
}

// Settles a fallen run into the meta once; asking again (the fall screen reopened after a reload) changes nothing.
export function endRun(state, meta) {
  if (Number.isFinite(state.echoesEarned)) return state.echoesEarned;
  const echoes = echoesFor(state);
  meta.echoes += echoes; meta.runs += 1; meta.bestWave = Math.max(meta.bestWave, state.wave);
  for (const b of state.beings) if (!meta.known.includes(b.identity)) meta.known.push(b.identity);
  state.echoesEarned = echoes;
  return echoes;
}

export function selectable(state, id) {
  return state.beings.find(b => b.id === id) || state.wells.find(w => w.id === id) || state.sites.find(s => s.id === id) || null;
}

export function validRun(value) {
  return !!(value && value.version === VERSION && Array.isArray(value.beings) && Array.isArray(value.wells) && Array.isArray(value.sites) && Array.isArray(value.enemies)
    && Number.isFinite(value.resonance) && Number.isFinite(value.tick) && value.conductor && Number.isFinite(value.conductor.hp)
    && ['interlude', 'wave', 'defeated'].includes(value.phase));
}
export function validMeta(value) {
  return !!(value && value.version === VERSION && Number.isFinite(value.echoes) && value.levels && typeof value.levels === 'object' && Array.isArray(value.known));
}
