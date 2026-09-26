// Resonance: joins the simulation, the stage, the sound, and the player's hands.
import * as S from './sim.js';
import { W, BEINGS, DEVELOPMENTS, GLOBAL, ECHOES, MOTIFS, WELL, GRID, CONDUCTOR } from './content.js';
import { Stage, fmt } from './render.js';
import { Sound } from './audio.js';
import { pitchFor } from './harmony.js';
import { claimGameLock } from './game-lock.js';

const RUN_KEY = 'resonance-run-v1';
const META_KEY = 'resonance-meta-v1';
const SAVE_KEY = 'resonance-save-v1';
const LATENCY = 0.06; // seconds between a beat in the simulation and its sound; visuals wait the same
const $ = id => document.getElementById(id);

let meta;
let loadedSave;
let awayEarned = 0;
let state;
let selectedId = null;
let placing = null; // being id being placed
let ghost = null;
let started = false;
let lastAudio = 0, lastPerf = performance.now();
let offset = 0; // audio time = sim time + offset
let hiddenAt = 0;
let lastUi = 0;
let ownsGame = false;
let gameLock = null;
let warnedStorage = false;

const stage = new Stage($('stage'));
const sound = new Sound();

// ---------- persistence ----------

function loadSave() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (snapshot) return snapshot;
    // Legacy saves remain readable; the next successful save migrates both
    // objects together without deleting the old recovery copy.
    return { ...JSON.parse(localStorage.getItem(RUN_KEY)), meta: JSON.parse(localStorage.getItem(META_KEY)) };
  } catch { return null; }
}
function loadMeta() {
  const m = loadedSave?.meta;
  if (S.validMeta(m)) return { tutorial: 0, ...m };
  return { ...S.newMeta(), tutorial: 0 };
}
function loadRun() {
  try {
    const saved = loadedSave;
    // A fallen run is kept until a new one begins, so a reload returns to the fall screen and its echo shop.
    if (saved && S.validRun(saved.state) && (saved.state.phase !== 'defeated' || Number.isFinite(saved.state.echoesEarned))) {
      const s = saved.state;
      S.network(s);
      awayEarned = S.settleAway(s, (Date.now() - saved.savedAt) / 1000);
      return s;
    }
  } catch { /* fresh */ }
  return S.newRun(meta);
}
function save() {
  if (!ownsGame || !state) return false;
  try {
    // While hidden the run is not advancing, so its save is stamped at the moment it was left.
    localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: hiddenAt || Date.now(), state, meta }, (k, v) => (k === 'relays' ? undefined : v)));
    return true;
  } catch {
    if (!warnedStorage) {
      warnedStorage = true;
      banner('Progress cannot be saved on this device.', true);
    }
    return false;
  }
}

// ---------- feedback ----------

let toastTimer = 0, bannerTimer = 0;
function toast(text) {
  if (!text) return;
  $('toast').textContent = text; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2600);
}
function banner(text, danger = false) {
  $('banner').textContent = text; $('banner').classList.toggle('danger', danger); $('banner').classList.add('visible');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => $('banner').classList.remove('visible'), 2400);
}

const pan = x => ((x - W / 2) / (W / 2)) * 0.7;
const DURATION = { thread: 0.45, pulse: 0.3, bell: 2.2, spark: 0.25 };

function hear(e) {
  if (!sound.running) return;
  const when = e.t !== undefined ? e.t + offset : sound.now;
  const bar = Math.floor(state.tick / (GRID * 4));
  switch (e.type) {
    case 'play': {
      const velocity = e.combat ? (e.accent ? 0.95 : 0.62) : 0.2;
      const duration = e.identity === 'drone' ? S.beatSeconds(state) * 4 : DURATION[e.identity];
      e.midis.forEach((m, i) => sound.play(e.identity, m, when, { velocity: velocity / (1 + i * 0.4), pan: pan(e.x), detune: e.detune, duration }));
      break;
    }
    case 'wellPay': sound.play('well', e.midi, when, { velocity: e.linked ? 0.5 : 0.22, pan: pan(e.x) }); break;
    case 'bar': {
      const placed = state.beings.filter(b => b.placed && b.hp > 0);
      const share = placed.length ? placed.filter(b => b.linked).length / placed.length : 1;
      sound.setVoices(placed.length + state.wells.filter(w => w.hp > 0).length);
      sound.chord(e.bar, when, 0.5 + 0.5 * share);
      break;
    }
    case 'tap': sound.play('tap', e.midi, sound.now, { velocity: e.onBeat ? 0.85 : 0.4, pan: pan(e.x) }); break;
    case 'kill': sound.play('kill', pitchFor('spark', bar, Math.floor(e.x)), when, { velocity: 0.6, pan: pan(e.x) }); break;
    case 'down': sound.play('hush', 38, when, { velocity: 0.8, duration: 1.8, pan: pan(e.x) }); break;
    case 'conductorHit': sound.play('hush', 31, when, { velocity: 0.7, duration: 0.6 }); break;
    case 'crisis': case 'bossShell': sound.play('hush', 26, when, { velocity: 1, duration: 3 }); break;
    case 'waveStart': sound.play('hush', 33, when, { velocity: 0.5, duration: 2 }); break;
    case 'bossBreak': case 'bossDown': case 'waveClear':
      [0, 1, 2].forEach(i => sound.play('bell', pitchFor('bell', bar, i), when + i * 0.09, { velocity: 0.7 })); break;
    case 'sing': [0, 1, 2].forEach(i => sound.play('tap', pitchFor('thread', bar, i * 2), sound.now + i * 0.12, { velocity: 0.8, duration: 2 })); break;
    case 'awakened': case 'placed': case 'rebuilt': sound.play('bell', pitchFor('bell', bar, 1), sound.now, { velocity: 0.5, pan: pan(e.x) }); break;
    case 'disconnected': sound.play('hush', 45, sound.now, { velocity: 0.4, duration: 0.9 }); break;
    default: break;
  }
}

function react(events) {
  for (const e of events) {
    const immediate = ['tap', 'strike', 'gust', 'accent', 'ward', 'placed', 'awakened', 'rebuilt', 'wellBuilt', 'developed', 'wellUp'].includes(e.type);
    stage.push(immediate ? { ...e, t: renderTime() } : e);
    // A sound that cannot play must never stop the events after it (a defeat, a wave clear) from landing.
    try { hear(e); } catch (err) { console.error('Resonance: could not sound', e.type, err); }
    switch (e.type) {
      case 'waveStart': banner(e.crisis ? 'Crisis · the Great Hush' : 'Wave ' + e.wave, true); break;
      case 'waveClear': toast('Wave ' + e.wave + ' resolved · +' + fmt(e.reward)); break;
      case 'bossShell': banner('It closes · swipe through it', true); break;
      case 'bossBreak': banner(e.waited ? 'The shell cracks open' : 'Broken open · strike now'); break;
      case 'bossDown': banner('The Hush becomes music'); toast('Something new sleeps where it fell.'); break;
      case 'sweepWarn': banner('A sweep is coming · hold to shelter', true); break;
      case 'found': if (e.kind === 'being') toast('A sleeping ' + BEINGS[e.identity].name + ' is within reach.'); break;
      case 'disconnected': { const b = state.beings.find(x => x.id === e.id); if (b && b.hp > 0) toast(BEINGS[b.identity].name + ' lost the pulse · it plays uncoordinated.'); break; }
      case 'reconnected': { const b = state.beings.find(x => x.id === e.id); if (b) toast(BEINGS[b.identity].name + ' hears the pulse again.'); break; }
      case 'down': if (e.kind === 'being') toast(BEINGS[e.identity].name + ' fell silent · rebuild it to bring its voice back.'); break;
      case 'motifOffer': openMotif(); break;
      case 'motif': $('motif').hidden = true; if (e.auto) toast(MOTIFS[e.id].name + ' joined the performance.'); break;
      case 'defeat': openFall(); break;
      default: break;
    }
  }
}

// Panel actions rebuild the panel; arena gestures only refresh it, so a thumb on a button isn't lost.
function act(result, quiet = false, rebuild = true) {
  react(result.events || []);
  if (!quiet || !result.ok) toast(result.message);
  save();
  renderUi(rebuild);
  return result;
}

// ---------- clock ----------

const renderTime = () => state.time - LATENCY;
// The simulation time of the moment the player is hearing, so a tap is judged against the beat they heard.
const heardTime = () => (sound.running ? sound.now - offset - sound.latency : renderTime());

function frame() {
  requestAnimationFrame(frame);
  const perf = performance.now();
  let dt;
  if (sound.running) { dt = sound.now - lastAudio; lastAudio = sound.now; }
  else dt = (perf - lastPerf) / 1000;
  lastPerf = perf;
  dt = Math.min(Math.max(dt, 0), 0.1);
  if (state && started && !document.hidden) {
    // Holding a ward drains power continuously.
    for (const p of pointers.values()) if (p.holding) { const r = S.hold(state, p.point, dt); if (!r.ok) p.holding = false; }
    react(S.step(state, dt));
    // Keep the audio clock and the simulation clock locked; resync after a stall.
    if (sound.running) { const target = sound.now - state.time + LATENCY; if (Math.abs(target - offset) > 0.04) offset = target; }
  }
  if (state) {
    stage.frame(state, { selectedId, ghost, placing: !!placing }, renderTime(), dt);
    if (perf - lastUi > 200) { renderUi(); lastUi = perf; }
  }
}

document.addEventListener('visibilitychange', () => {
  if (!state) return;
  if (document.hidden) { hiddenAt = Date.now(); save(); pointers.clear(); }
  else if (hiddenAt && ownsGame) {
    const away = (Date.now() - hiddenAt) / 1000;
    hiddenAt = 0;
    if (away > 0) {
      const earned = S.settleAway(state, away);
      if (earned >= 1) toast('While you were away, the wells gathered +' + fmt(earned) + '.');
      if (away > 5 && state.phase === 'wave') { state.paused = true; banner('The Hush waited for you'); }
    }
    wakeSound();
    lastAudio = sound.now; lastPerf = performance.now();
  }
});
setInterval(save, 4000);

window.addEventListener('pagehide', () => {
  if (ownsGame) save();
  clearRosterGesture();
  ownsGame = false;
  suspendGame();
  gameLock?.release();
  gameLock = null;
});
window.addEventListener('pageshow', () => {
  if (!ownsGame && !gameLock) requestGameLock();
});

// ---------- hands ----------

const canvas = $('stage');
const pointers = new Map();

// The OS can suspend audio (a call, another app taking focus). The next touch brings it back.
const wakeSound = () => { if (started && sound.ctx && !sound.running) sound.start().catch(() => {}); };

canvas.addEventListener('pointerdown', e => {
  if (!started) return;
  wakeSound();
  canvas.setPointerCapture(e.pointerId);
  const p = stage.toWorld(e.clientX, e.clientY);
  const ptr = { start: p, point: p, at: performance.now(), heard: heardTime(), moved: false, holding: false, held: false };
  pointers.set(e.pointerId, ptr);
  if (placing) ghost = ghostAt(p);
  if (state.paused) { state.paused = false; }
  // Bound to this press: a mouse reuses one pointerId, so a lookup by id could promote a later click.
  setTimeout(() => { if (pointers.get(e.pointerId) === ptr && !ptr.moved && !placing) ptr.holding = ptr.held = true; }, 320);
});
canvas.addEventListener('pointermove', e => {
  const p = stage.toWorld(e.clientX, e.clientY);
  if (placing) ghost = ghostAt(p);
  const ptr = pointers.get(e.pointerId);
  if (!ptr) return;
  ptr.point = p;
  if (!ptr.holding && Math.hypot(p.x - ptr.start.x, p.y - ptr.start.y) > 18) ptr.moved = true;
});
const release = e => {
  const ptr = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (!ptr || !started) return;
  const p = stage.toWorld(e.clientX, e.clientY);
  if (placing) { tryPlace(p); return; }
  if (ptr.held) return; // a hold stays a hold, even one that ran out of power
  if (ptr.moved) { act(S.swipe(state, ptr.start, p), true, false); return; }
  const result = S.tap(state, p, state.time - ptr.heard);
  if ('select' in result) { selectedId = result.select; }
  act(result, true, false);
  tutorial();
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', e => pointers.delete(e.pointerId));
canvas.addEventListener('pointerleave', () => { if (placing && !pointers.size) ghost = null; });

function ghostAt(p) {
  const being = state.beings.find(b => b.id === placing);
  return being ? { identity: being.identity, stats: S.beingStats(state, being), x: p.x, y: p.y, reason: S.placementReason(state, p.x, p.y, being.id) } : null;
}
// A placement that fails also ends placing, so the next touch strikes and gathers as usual.
function tryPlace(p) {
  const result = S.place(state, placing, p.x, p.y);
  if (result.ok) selectedId = placing;
  placing = null; ghost = null;
  act(result);
  tutorial();
}

// Roster chips: tap to pick up, then tap the arena; or drag straight onto it.
// Let the browser own a horizontal touch pan so an overflowing roster remains scrollable.
const roster = $('roster');
let rosterGesture = null;
function clearRosterGesture(refresh = false) {
  const gesture = rosterGesture;
  if (!gesture) return;
  window.removeEventListener('pointermove', gesture.move);
  window.removeEventListener('pointerup', gesture.finish);
  window.removeEventListener('pointercancel', gesture.finish);
  rosterGesture = null;
  ghost = null;
  if (refresh && state) renderUi(true);
}
roster.addEventListener('pointerdown', e => {
  if (!ownsGame || !state || !started) return;
  const chip = e.target.closest('[data-being]');
  if (!chip) return;
  if (rosterGesture) return;
  const gesture = rosterGesture = { id: e.pointerId, being: chip.dataset.being, x: e.clientX, y: e.clientY, intent: null };
  const finish = ev => {
    if (ev.pointerId !== gesture.id) return;
    if (!state) { clearRosterGesture(); return; }
    clearRosterGesture();
    if (ev.type === 'pointercancel') {
      if (gesture.intent === 'drag' && placing === gesture.being) placing = null;
      if (gesture.intent === 'drag') renderUi(true);
      return;
    }
    if (gesture.intent === 'scroll') return;
    const r = canvas.getBoundingClientRect();
    if (gesture.intent === 'drag') {
      if (placing && ev.type === 'pointerup' && ev.clientY < r.bottom && ev.clientY > r.top && ev.clientX > r.left && ev.clientX < r.right) tryPlace(stage.toWorld(ev.clientX, ev.clientY));
      else renderUi(true);
      return;
    }
    if (ev.type !== 'pointerup') return;
    placing = placing === gesture.being ? null : gesture.being;
    ghost = null;
    renderUi(true);
    if (placing) toast('Drag or tap inside the lit area to place it.');
  };
  const move = ev => {
    if (ev.pointerId !== gesture.id) return;
    if (!state) { clearRosterGesture(); return; }
    if (gesture.intent === 'scroll') return;
    const dx = ev.clientX - gesture.x, dy = ev.clientY - gesture.y;
    if (!gesture.intent) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      gesture.intent = Math.abs(dx) >= Math.abs(dy) ? 'scroll' : 'drag';
      if (gesture.intent === 'scroll') return;
      placing = gesture.being;
    }
    ghost = ghostAt(stage.toWorld(ev.clientX, ev.clientY));
  };
  gesture.move = move;
  gesture.finish = finish;
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
});

// ---------- panels ----------

function button(label, detail, cost, onClick, extra = '') {
  const b = document.createElement('button');
  const affordable = !Number.isFinite(cost) || state.resonance >= cost;
  b.className = 'buy ' + extra + (Number.isFinite(cost) && !affordable ? ' cant' : '');
  b.innerHTML = `<b></b><span></span>${detail ? '<small></small>' : ''}`;
  b.children[0].textContent = label;
  b.children[1].textContent = cost === null ? '' : Number.isFinite(cost) ? fmt(cost) + ' ✧' : 'complete';
  if (detail) b.children[2].textContent = detail;
  b.disabled = cost !== null && !Number.isFinite(cost);
  if (Number.isFinite(cost)) b.dataset.cost = cost;
  b.addEventListener('click', onClick);
  return b;
}

function head(title, statusText, statusClass) {
  const d = document.createElement('div'); d.className = 'panel-head';
  const h = document.createElement('h2'); h.textContent = title; d.append(h);
  if (statusText) { const s = document.createElement('span'); s.className = 'status ' + statusClass; s.textContent = statusText; d.append(s); }
  const x = document.createElement('button'); x.className = 'close'; x.textContent = '×'; x.setAttribute('aria-label', 'Close');
  x.addEventListener('click', () => { selectedId = null; renderUi(true); });
  if (selectedId) d.append(x);
  return d;
}
const para = (text, cls) => { const p = document.createElement('p'); p.textContent = text; if (cls) p.className = cls; return p; };
// Text that changes every moment (power, health, a cooldown) refreshes in place instead of rebuilding the panel.
const live = (el, text) => { el.textContent = text(); el.live = text; el.classList.add('live'); return el; };
const grid = (cls = '') => { const g = document.createElement('div'); g.className = 'grid ' + cls; return g; };

const RHYTHM = { 1: 'every sixteenth', 2: 'every eighth', 4: 'every beat', 8: 'every two beats', 16: 'every bar' };

function beingPanel(b) {
  const def = BEINGS[b.identity];
  const panel = [];
  const status = b.hp <= 0 ? ['silent', 'silent'] : !b.placed ? ['waiting', 'silent'] : b.linked ? ['in the pulse', 'linked'] : ['uncoordinated', 'stray'];
  panel.push(head(def.name, status[0], status[1]));
  const stats = S.beingStats(state, b);
  panel.push(para(def.role));
  panel.push(para(`${fmt(stats.damage)} dmg · ${RHYTHM[stats.period] || 'every ' + stats.period / 4 + ' beats'} · range ${stats.range} · relays ${stats.relay}${b.ensemble ? ' · ensemble +' + b.ensemble * 12 + '%' : ''}`, 'stats'));
  if (b.hp <= 0) {
    panel.push(button('Rebuild', 'Returns with all of its development.', S.rebuildCost(state, b), () => act(S.rebuild(state, b.id)), 'primary'));
    return panel;
  }
  const g = grid();
  for (const kind of Object.keys(DEVELOPMENTS)) {
    const dev = DEVELOPMENTS[kind];
    const level = kind === 'mastery' ? b.dev.mastery : b.dev[kind];
    g.append(button(`${dev.name} ${kind === 'mastery' ? level : '+' + level}`, dev.verb.replace(/^./, c => c.toUpperCase()), S.devCost(b, kind), () => act(S.develop(state, b.id, kind))));
  }
  panel.push(g);
  if (b.placed) panel.push(button('Move', 'Step out of the arrangement and place again.', null, () => { if (act(S.lift(state, b.id)).ok) placing = b.id; renderUi(true); }));
  return panel;
}

function wellPanel(w) {
  const panel = [head('Well · level ' + w.level, w.hp <= 0 ? 'silent' : w.linked ? 'in the pulse' : 'faint', w.hp <= 0 ? 'silent' : w.linked ? 'linked' : 'stray')];
  panel.push(para(w.linked ? 'Draws music from the ground on every bar.' : 'Outside the pulse it gathers half. Extend a relay to reach it.'));
  panel.push(live(para('', 'stats'), () => `${fmt(S.wellYield(state, w))} per bar · hp ${Math.ceil(w.hp)}/${w.maxHp}`));
  if (w.hp <= 0) panel.push(button('Rebuild', 'Returns at its full depth.', S.rebuildCost(state, w), () => act(S.rebuild(state, w.id)), 'primary'));
  else panel.push(button('Deepen', `+${fmt(WELL.yield * (1 + 0.12 * (state.echo.deepWells || 0)))} per bar`, S.wellUpgradeCost(w), () => act(S.upgradeWell(state, w.id)), 'primary'));
  return panel;
}

function sitePanel(s) {
  if (s.kind === 'well') {
    return [head('Dormant ground'), para('Music sleeps in the ground here. A well draws it out on every bar.'), button('Build a well', null, S.wellBuildCost(state), () => { const r = act(S.buildWell(state, s.id)); if (r.ok) selectedId = r.wellId; renderUi(true); }, 'primary')];
  }
  const def = BEINGS[s.identity];
  const panel = [head('A sleeping ' + def.name), para(def.role)];
  if (S.isCovered(state, s)) panel.push(button('Awaken', 'It joins you, ready to be placed.', S.awakenCost(state), () => { const r = act(S.awaken(state, s.id)); if (r.ok) { selectedId = null; placing = r.beingId; renderUi(true); } }, 'primary'));
  else panel.push(para('The pulse must reach it before it can wake. Place a being closer.'));
  return panel;
}

function conductorPanel() {
  const panel = [];
  const top = document.createElement('div'); top.className = 'row';
  const c = state.conductor;
  const sing = button('Sing', ' ', null, () => act(S.sing(state)));
  live(sing.children[2], () => (c.singCooldown > 0 ? `echoing · ${Math.ceil(c.singCooldown)}s` : 'Orchestra and wells swell for 8s.'));
  top.append(sing);
  if (state.phase === 'interlude') top.append(button('Call the wave', 'Earlier means a bonus.', null, () => act(S.callWave(state))));
  panel.push(top);
  if (state.phase !== 'interlude') panel.push(live(para('', 'stats'), () => `Power ${Math.floor(c.power)} · strike ${CONDUCTOR.strikeCost} (free on the beat) · accent ${CONDUCTOR.accentCost} · gust ${CONDUCTOR.gustCost} · shelter ${CONDUCTOR.wardDrain}/s`));
  const g = grid();
  for (const key of Object.keys(GLOBAL)) g.append(button(`${GLOBAL[key].name} ${state.globals[key]}`, GLOBAL[key].detail, S.globalCost(state, key), () => act(S.buyGlobal(state, key))));
  panel.push(g);
  return panel;
}

let uiSignature = '';
function renderUi(force = false) {
  $('res').textContent = fmt(state.resonance);
  $('rate').textContent = '+' + fmt(S.incomePerSecond(state)) + '/s · ' + S.bpm(state) + ' bpm';
  const phase = $('phase');
  const crisis = !!state.boss;
  phase.className = 'phase' + (state.phase === 'wave' ? (crisis ? ' crisis' : ' wave') : '');
  phase.textContent = state.paused ? 'Paused · tap to resume'
    : state.phase === 'interlude' ? `Wave ${state.wave + 1} in ${Math.ceil(state.interlude)}s`
    : state.phase === 'wave' ? (crisis ? 'Crisis' : 'Wave ' + state.wave) + ` · ${state.enemies.length + state.toSpawn.length} left`
    : 'Fallen';

  // Rebuild panels only when what they show has changed, so buttons don't flicker under a finger.
  const sel = selectedId && S.selectable(state, selectedId);
  if (selectedId && !sel) selectedId = null;
  const signature = JSON.stringify([selectedId, placing, state.phase, state.globals, sel && [sel.hp > 0, sel.linked, sel.dev, sel.level, sel.placed, sel.taken, sel.discovered, sel.kind === 'being' && S.isCovered(state, sel)], state.beings.map(b => b.placed + b.id)]);
  if (!force && signature === uiSignature) {
    for (const b of $('panel').querySelectorAll('button[data-cost]')) b.classList.toggle('cant', state.resonance < Number(b.dataset.cost));
    for (const el of $('panel').querySelectorAll('.live')) el.textContent = el.live();
    return;
  }
  uiSignature = signature;

  const roster = $('roster');
  if (!rosterGesture) {
    roster.replaceChildren();
    for (const b of state.beings.filter(x => !x.placed)) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (placing === b.id ? ' placing' : ''); chip.dataset.being = b.id;
      chip.innerHTML = '<span class="dot"></span><span></span><small></small>';
      chip.children[0].style.color = BEINGS[b.identity].color;
      chip.children[1].textContent = BEINGS[b.identity].name;
      chip.children[2].textContent = b.dev.mastery > 1 || b.dev.subdivision || b.dev.octave || b.dev.reach ? `M${b.dev.mastery}` : 'place';
      roster.append(chip);
    }
  }
  const panel = $('panel'); panel.replaceChildren();
  let contents;
  if (!sel) contents = conductorPanel();
  else if (sel.identity && sel.dev) contents = beingPanel(sel);
  else if (sel.siteId) contents = wellPanel(sel);
  else contents = sitePanel(sel);
  panel.append(...contents);
}

// ---------- overlays ----------

function openMotif() {
  const box = $('motif-options'); box.replaceChildren();
  for (const id of state.motifOffer || []) box.append(button(MOTIFS[id].name, MOTIFS[id].detail, null, () => { act(S.chooseMotif(state, id)); $('motif').hidden = true; }));
  $('motif').hidden = false;
}

function openFall() {
  const earned = S.endRun(state, meta);
  save();
  $('fall-title').textContent = 'You held until wave ' + state.wave;
  $('fall-text').textContent = `${state.stats.kills} threats resolved, ${state.stats.bosses} crises survived, ${fmt(state.lifetime)} Resonance gathered. +${earned} echoes. Best: wave ${meta.bestWave}.`;
  renderShop();
  $('fall').hidden = false;
}

function renderShop() {
  const shop = $('echo-shop'); shop.replaceChildren();
  const have = document.createElement('p'); have.className = 'fine'; have.textContent = meta.echoes + ' echoes to spend'; shop.append(have);
  for (const key of Object.keys(ECHOES)) {
    const cost = S.echoCost(meta, key);
    const b = button(`${ECHOES[key].name} ${meta.levels[key] || 0}`, ECHOES[key].detail, null, () => { const r = S.buyEcho(meta, key); toast(r.message); save(); renderShop(); });
    b.children[1].textContent = Number.isFinite(cost) ? cost + ' echoes' : 'complete';
    b.disabled = !Number.isFinite(cost) || meta.echoes < cost;
    shop.append(b);
  }
}

$('again').addEventListener('click', () => {
  if (!ownsGame || !state) return;
  state = S.newRun(meta);
  selectedId = null; placing = null; ghost = null;
  stage.fx = []; stage.vib.clear();
  $('fall').hidden = true;
  save(); renderUi(true);
  banner('A new performance');
});

$('begin').addEventListener('click', async () => {
  if (!ownsGame || !state) return;
  try { await sound.start(); } catch { toast('Sound could not start here; the game runs silently.'); }
  if (!ownsGame || !state) return;
  lastAudio = sound.now; lastPerf = performance.now();
  offset = sound.now - state.time + LATENCY;
  sound.setTempo(S.bpm(state));
  started = true;
  state.paused = false;
  $('curtain').hidden = true;
  if (awayEarned >= 1) toast('While you were away, the wells gathered +' + fmt(awayEarned) + '.');
  if (state.phase === 'defeated') openFall();
  else if (state.motifOffer) openMotif();
  tutorial();
});

$('sound').addEventListener('click', () => { sound.setMuted(!sound.muted); $('sound').setAttribute('aria-pressed', String(sound.muted)); });
$('pause').addEventListener('click', () => { if (ownsGame && state) { state.paused = !state.paused; renderUi(true); } });

// ---------- first performance ----------

const LESSONS = [
  { text: 'Tap anywhere to gather Resonance. A tap on the beat earns a little more.', done: () => state.stats.taps >= 5 },
  { text: 'A Pulse waits below. Drag it into the lit circle around you.', done: () => state.beings.filter(b => b.placed).length >= 2 },
  { text: 'Tap a dashed crystal and build a well. Wells gather on every bar, even while you are away.', done: () => state.wells.length >= 1 },
  { text: 'When the dark shapes come, tap them to strike. Your beings play and fight on their own.', done: () => state.wave >= 1 && state.phase === 'interlude' },
  { text: 'Beings carry your pulse. Place one near the edge of the light to reach farther, and wake what sleeps there.', done: () => state.beings.length >= 3 },
  { text: 'Swipe to push the Hush back. Hold a finger down to shelter what is under it.', done: () => state.wave >= 3 },
];
function tutorial() {
  if (!state) return;
  const hint = $('hint');
  while (meta.tutorial < LESSONS.length && LESSONS[meta.tutorial].done()) meta.tutorial++;
  if (meta.tutorial >= LESSONS.length || meta.runs > 0) { hint.hidden = true; return; }
  hint.textContent = LESSONS[meta.tutorial].text; hint.hidden = false;
}
setInterval(tutorial, 1000);

let lastBpm = 0;
setInterval(() => {
  if (!state) return;
  const b = S.bpm(state); if (b !== lastBpm) { lastBpm = b; sound.setTempo(b); }
}, 500);

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

window.__resonance = { get state() { return state; }, get ownsGame() { return ownsGame; }, S, stage, sound };
requestAnimationFrame(frame);

function suspendGame() {
  started = false;
  clearRosterGesture();
  state = undefined;
  meta = undefined;
  pointers.clear();
  if (sound.ctx) sound.ctx.suspend().catch(() => {});
  $('fall').hidden = true;
  $('motif').hidden = true;
}

function waitingForGame(text, disabled = true) {
  suspendGame();
  $('curtain').hidden = false;
  $('curtain-text').textContent = text;
  $('begin').textContent = disabled ? 'Waiting for the other tab' : 'Begin';
  $('begin').disabled = disabled;
}

function activateGame() {
  // This happens inside the lock callback: the state is always the latest one
  // written by the prior owner, never a snapshot from while this tab waited.
  ownsGame = true;
  warnedStorage = false;
  awayEarned = 0;
  loadedSave = loadSave();
  meta = loadMeta();
  state = loadRun();
  loadedSave = null;
  hiddenAt = document.hidden ? Date.now() : 0;
  selectedId = null; placing = null; ghost = null;
  lastBpm = S.bpm(state);
  if (awayEarned >= 1) $('curtain-text').textContent = 'Welcome back. While you were away the wells gathered +' + fmt(awayEarned) + ' Resonance. The Hush waited.';
  else if (meta.runs > 0 || state.wave > 0) $('curtain-text').textContent = 'The orchestra is where you left it.';
  else $('curtain-text').textContent = 'The world has gone quiet. You are its conductor: gather what still sings, wake the beings that sleep in it, and hold the Hush back with music.';
  $('begin').textContent = state.wave > 0 || awayEarned > 0 ? 'Return' : 'Begin';
  $('begin').disabled = false;
  renderUi(true);
}

function requestGameLock() {
  gameLock = claimGameLock({
    locks: navigator.locks,
    onWaiting: () => waitingForGame('Another Resonance tab is playing. This tab will load the latest performance when it closes.'),
    onOwner: activateGame,
    onUnavailable: () => waitingForGame('This browser cannot protect saved progress across tabs. Open Resonance in an up-to-date browser over HTTPS or localhost.'),
    onError: () => waitingForGame('Resonance could not protect this performance. Close other tabs and reload.'),
  });
}

requestGameLock();
