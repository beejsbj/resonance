/* Resonance economy: portable, dependency-free, and deliberately DOM-free. */
(function (root) {
  'use strict';

  var VOICES = [
    { id: 'bloom', name: 'Bloom', description: 'A warm first pulse of resonance.', baseCost: 12, baseRate: 0.35, unlockAt: 0 },
    { id: 'string', name: 'String', description: 'A singing harmonic thread.', baseCost: 45, baseRate: 1.35, unlockAt: 20 },
    { id: 'bell', name: 'Bell', description: 'A clear tone that opens the air.', baseCost: 500, baseRate: 4.2, unlockAt: 220 },
    { id: 'pulse', name: 'Pulse', description: 'A steady low rhythm.', baseCost: 1800, baseRate: 12, unlockAt: 700 },
    { id: 'pad', name: 'Pad', description: 'A wide field of sustained sound.', baseCost: 5000, baseRate: 32, unlockAt: 1800 }
  ];

  var WORLDS = [
    { id: 'awakening', name: 'Awakening', mode: 'pentatonic', root: 50, bpm: 72, unlockAt: 0, description: 'The first room of listening.' },
    { id: 'current', name: 'Current', mode: 'dorian', root: 50, bpm: 88, unlockAt: 400, description: 'A moving, tidal harmonic field.' },
    { id: 'radiance', name: 'Radiance', mode: 'lydian', root: 55, bpm: 108, unlockAt: 2000, description: 'A bright horizon of overtones.' }
  ];

  var UPGRADES = [
    { id: 'touch', name: 'Sensitive Touch', description: 'Each tap carries more resonance.', baseCost: 25, growth: 2.15, max: 20 },
    { id: 'ensemble', name: 'Ensemble Listening', description: 'All voices resonate together more strongly.', baseCost: 180, growth: 2.65, max: 10 }
  ];

  var voiceById = function (id) {
    for (var i = 0; i < VOICES.length; i += 1) if (VOICES[i].id === id) return VOICES[i];
    return null;
  };
  var worldById = function (id) {
    for (var i = 0; i < WORLDS.length; i += 1) if (WORLDS[i].id === id) return WORLDS[i];
    return null;
  };
  var upgradeById = function (id) {
    for (var i = 0; i < UPGRADES.length; i += 1) if (UPGRADES[i].id === id) return UPGRADES[i];
    return null;
  };
  var validState = function (s) { return s && typeof s === 'object' && isFinite(s.resonance) && isFinite(s.totalEarned) && s.levels && s.upgrades; };
  var addEarned = function (s, amount) { s.resonance += amount; s.totalEarned += amount; s.runEarned += amount; };

  function initial() {
    return { resonance: 0, totalEarned: 0, runEarned: 0, levels: { bloom: 0, string: 0, bell: 0, pulse: 0, pad: 0 }, upgrades: { touch: 0, ensemble: 0 }, world: 'awakening', legacy: 0, totalTaps: 0, elapsed: 0 };
  }

  function cost(state, id) {
    var v = voiceById(id); var level = state && state.levels ? state.levels[id] : 0;
    if (!v || !isFinite(level) || level < 0) return Infinity;
    return Math.ceil(v.baseCost * Math.pow(1.15, level));
  }

  function rate(state) {
    if (!validState(state)) return 0;
    var total = 0;
    for (var i = 0; i < VOICES.length; i += 1) {
      var v = VOICES[i], level = Math.max(0, Number(state.levels[v.id]) || 0);
      var milestone = (level >= 25 ? 2 : 1) * (level >= 10 ? 2 : 1) * (level >= 5 ? 2 : 1);
      total += level * v.baseRate * milestone;
    }
    return total * (1 + (Math.max(0, Number(state.upgrades.ensemble) || 0) * 0.12)) * (1 + (Math.max(0, Number(state.legacy) || 0) * 0.03));
  }

  function tapValue(state) {
    if (!validState(state)) return 0;
    return (1 + (Math.max(0, Number(state.upgrades.touch) || 0) * 0.8)) * (1 + (Math.max(0, Number(state.legacy) || 0) * 0.03));
  }

  function phase(state) {
    if (!validState(state)) return { name: 'still', value: 0 };
    var value = (state.elapsed * 0.07 + state.totalEarned * 0.003) % 1;
    var names = ['still', 'stirring', 'gathering', 'resonant'];
    return { name: names[Math.min(3, Math.floor(value * 4))], value: value };
  }

  function canBuy(state, id) {
    var v = voiceById(id);
    return !!(validState(state) && v && state.totalEarned >= v.unlockAt && state.resonance >= cost(state, id));
  }

  function buy(state, id) {
    var v = voiceById(id);
    if (!validState(state) || !v) return { ok: false, message: 'Unknown voice.' };
    if (state.totalEarned < v.unlockAt) return { ok: false, message: v.name + ' is not yet awakened.' };
    var price = cost(state, id);
    if (state.resonance < price) return { ok: false, message: 'Not enough resonance.' };
    state.resonance -= price; state.levels[id] += 1;
    return { ok: true, message: v.name + ' joined the ensemble.', cost: price, level: state.levels[id] };
  }

  function tap(state, strength) {
    if (!validState(state) || strength === undefined) strength = strength === undefined ? 1 : strength;
    if (!validState(state) || !isFinite(strength) || strength < 0) return { ok: false, message: 'Tap strength must be finite and non-negative.' };
    var earned = tapValue(state) * strength; addEarned(state, earned); state.totalTaps += 1;
    return { ok: true, earned: earned, message: 'Resonance gathered.' };
  }

  function tick(state, seconds) {
    if (!validState(state) || !isFinite(seconds) || seconds < 0) return { ok: false, message: 'Time must be finite and non-negative.' };
    var earned = rate(state) * seconds; addEarned(state, earned); state.elapsed += seconds;
    return { ok: true, earned: earned, message: earned ? 'The ensemble resonated.' : 'The room listened.' };
  }

  function setWorld(state, id) {
    var w = worldById(id);
    if (!validState(state) || !w) return { ok: false, message: 'Unknown world.' };
    if (state.totalEarned < w.unlockAt) return { ok: false, message: w.name + ' is still beyond reach.' };
    state.world = id; return { ok: true, message: 'Entered ' + w.name + '.' };
  }

  function upgradeCost(state, id) {
    var u = upgradeById(id), level = state && state.upgrades ? state.upgrades[id] : 0;
    if (!u || !isFinite(level) || level < 0 || level >= u.max) return Infinity;
    return Math.ceil(u.baseCost * Math.pow(u.growth, level));
  }
  function upgrades(state) {
    return UPGRADES.map(function (u) { return { id: u.id, name: u.name, description: u.description, level: state && state.upgrades ? state.upgrades[u.id] : 0, cost: upgradeCost(state, u.id), max: u.max }; });
  }
  function buyUpgrade(state, id) {
    var u = upgradeById(id);
    if (!validState(state) || !u) return { ok: false, message: 'Unknown upgrade.' };
    var price = upgradeCost(state, id);
    if (price === Infinity) return { ok: false, message: u.name + ' is fully attuned.' };
    if (state.resonance < price) return { ok: false, message: 'Not enough resonance.' };
    state.resonance -= price; state.upgrades[id] += 1;
    return { ok: true, message: u.name + ' improved.', cost: price, level: state.upgrades[id] };
  }

  function prestige(state) {
    if (!validState(state) || state.runEarned < 8000) return { ok: false, message: 'Earn 8,000 resonance this cycle first.' };
    var legacy = state.legacy + 1, lifetime = state.totalEarned;
    state.resonance = 0; state.runEarned = 0; state.levels = { bloom: 0, string: 0, bell: 0, pulse: 0, pad: 0 }; state.upgrades = { touch: 0, ensemble: 0 }; state.world = 'awakening'; state.elapsed = 0; state.legacy = legacy; state.totalEarned = lifetime;
    return { ok: true, earned: 0, legacy: legacy, message: 'The resonance begins anew.' };
  }

  root.ResonanceGame = { VOICES: VOICES, WORLDS: WORLDS, UPGRADES: UPGRADES, initial: initial, cost: cost, rate: rate, tapValue: tapValue, phase: phase, canBuy: canBuy, buy: buy, tap: tap, tick: tick, setWorld: setWorld, buyUpgrade: buyUpgrade, prestige: prestige, upgradeCost: upgradeCost, upgrades: upgrades };
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
