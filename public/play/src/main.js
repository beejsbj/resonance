// Resonance: joins the simulation, the stage, the sound, and the player's hands.
import * as S from './sim.js';
import { W, BEINGS, DEVELOPMENTS, GLOBAL, ECHOES, MOTIFS, WELL, GRID, CONDUCTOR } from './content.js';
import { Stage, fmt } from './render.js';
import { Sound } from './audio.js';
import { pitchFor } from './harmony.js';

const RUN_KEY = 'resonance-run-v1';
const META_KEY = 'resonance-meta-v1';
const LATENCY = 0.06; // seconds between a beat in the simulation and its sound; visuals wait the same
const $ = id => document.getElementById(id);

const meta = loadMeta();
let awayEarned = 0; // declared before loadRun(), which assigns it
let state = loadRun();
let selectedId = null;
let placing = null; // being id being placed
let ghost = null;
let started = false;
let lastAudio = 0, lastPerf = performance.now();
let offset = 0; // audio time = sim time + offset
let hiddenAt = 0;
let lastUi = 0;

const stage = new Stage($('stage'));
const sound = new Sound();

// ---------- persistence ----------

function loadMeta() {
  try { const m = JSON.parse(localStorage.getItem(META_KEY)); if (S.validMeta(m)) return { tutorial: 0, ...m }; } catch { /* fresh */ }
  return { ...S.newMeta(), tutorial: 0 };
}
function loadRun() {
  try {
    const saved = JSON.parse(localStorage.getItem(RUN_KEY));
    if (saved && S.validRun(saved.state) && saved.state.phase !== 'defeated') {
      const s = saved.state;
      S.network(s);
      awayEarned = S.settleAway(s, (Date.now() - saved.savedAt) / 1000);
      return s;
    }
  } catch { /* fresh */ }
  return S.newRun(meta);
}
function save() {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify({ savedAt: Date.now(), state }, (k, v) => (k === 'relays' ? undefined : v)));
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch { /* storage full or blocked: the run continues unsaved */ }
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
    hear(e);
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
      case 'motif': if (e.auto) toast(MOTIFS[e.id].name + ' joined the performance.'); break;
      case 'defeat': openFall(); break;
      default: break;
    }
  }
}

function act(result, quiet = false) {
  react(result.events || []);
  if (!quiet || !result.ok) toast(result.message);
  save();
  renderUi(true);
  return result;
}

// ---------- clock ----------

const renderTime = () => state.time - LATENCY;

function frame() {
  requestAnimationFrame(frame);
  const perf = performance.now();
  let dt;
  if (sound.running) { dt = sound.now - lastAudio; lastAudio = sound.now; }
  else dt = (perf - lastPerf) / 1000;
  lastPerf = perf;
  dt = Math.min(Math.max(dt, 0), 0.1);
  if (started && !document.hidden) {
    // Holding a ward drains power continuously.
    for (const p of pointers.values()) if (p.holding) { const r = S.hold(state, p.point, dt); if (!r.ok) p.holding = false; }
    react(S.step(state, dt));
    // Keep the audio clock and the simulation clock locked; resync after a stall.
    if (sound.running) { const target = sound.now - state.time + LATENCY; if (Math.abs(target - offset) > 0.04) offset = target; }
  }
  stage.frame(state, { selectedId, ghost, placing: !!placing }, renderTime(), dt);
  if (perf - lastUi > 200) { renderUi(); lastUi = perf; }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); save(); pointers.clear(); }
  else if (hiddenAt) {
    const away = (Date.now() - hiddenAt) / 1000;
    hiddenAt = 0;
    if (away > 5) {
      const earned = S.settleAway(state, away);
      if (earned >= 1) toast('While you were away, the wells gathered +' + fmt(earned) + '.');
      if (state.phase === 'wave') { state.paused = true; banner('The Hush waited for you'); }
    }
    lastAudio = sound.now; lastPerf = performance.now();
  }
});
setInterval(save, 4000);

// ---------- hands ----------

const canvas = $('stage');
const pointers = new Map();

canvas.addEventListener('pointerdown', e => {
  if (!started) return;
  canvas.setPointerCapture(e.pointerId);
  const p = stage.toWorld(e.clientX, e.clientY);
  pointers.set(e.pointerId, { start: p, point: p, at: performance.now(), moved: false, holding: false });
  if (placing) ghost = ghostAt(p);
  if (state.paused) { state.paused = false; }
  setTimeout(() => {
    const ptr = pointers.get(e.pointerId);
    if (ptr && !ptr.moved && !placing) { ptr.holding = true; }
  }, 320);
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
  if (ptr.holding) return;
  if (ptr.moved) { act(S.swipe(state, ptr.start, p), true); return; }
  const result = S.tap(state, p);
  if ('select' in result) { selectedId = result.select; }
  act(result, true);
  tutorial();
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', e => pointers.delete(e.pointerId));
canvas.addEventListener('pointerleave', () => { if (placing && !pointers.size) ghost = null; });

function ghostAt(p) {
  const being = state.beings.find(b => b.id === placing);
  return being ? { identity: being.identity, x: p.x, y: p.y, reason: S.placementReason(state, p.x, p.y, being.id) } : null;
}
function tryPlace(p) {
  const result = S.place(state, placing, p.x, p.y);
  if (result.ok) { selectedId = placing; placing = null; ghost = null; }
  act(result);
  tutorial();
}

// Roster chips: tap to pick up, then tap the arena; or drag straight onto it.
$('roster').addEventListener('pointerdown', e => {
  const chip = e.target.closest('[data-being]');
  if (!chip) return;
  e.preventDefault();
  const id = chip.dataset.being;
  placing = placing === id ? null : id;
  ghost = null;
  renderUi(true);
  if (!placing) return;
  toast('Drag or tap inside the lit area to place it.');
  const move = ev => { const p = stage.toWorld(ev.clientX, ev.clientY); ghost = ghostAt(p); };
  const up = ev => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    const r = canvas.getBoundingClientRect();
    if (placing && ev.clientY < r.bottom && ev.clientY > r.top && ev.clientX > r.left && ev.clientX < r.right) tryPlace(stage.toWorld(ev.clientX, ev.clientY));
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
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
  if (b.placed) panel.push(button('Move', 'Step out of the arrangement and place again.', null, () => { act(S.lift(state, b.id)); placing = b.id; renderUi(true); }));
  return panel;
}

function wellPanel(w) {
  const panel = [head('Well · level ' + w.level, w.hp <= 0 ? 'silent' : w.linked ? 'in the pulse' : 'faint', w.hp <= 0 ? 'silent' : w.linked ? 'linked' : 'stray')];
  panel.push(para(w.linked ? 'Draws music from the ground on every bar.' : 'Outside the pulse it gathers half. Extend a relay to reach it.'));
  panel.push(para(`${fmt(S.wellYield(state, w))} per bar · hp ${Math.ceil(w.hp)}/${w.maxHp}`, 'stats'));
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
  top.append(button('Sing', c.singCooldown > 0 ? `echoing · ${Math.ceil(c.singCooldown)}s` : 'Orchestra and wells swell for 8s.', null, () => act(S.sing(state))));
  if (state.phase === 'interlude') top.append(button('Call the wave', 'Earlier means a bonus.', null, () => act(S.callWave(state))));
  panel.push(top);
  if (state.phase !== 'interlude') panel.push(para(`Power ${Math.floor(c.power)} · strike ${CONDUCTOR.strikeCost} (free on the beat) · accent ${CONDUCTOR.accentCost} · gust ${CONDUCTOR.gustCost} · shelter ${CONDUCTOR.wardDrain}/s`, 'stats'));
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
  const signature = JSON.stringify([selectedId, placing, Math.floor(state.resonance), state.phase, state.globals, state.conductor.singCooldown > 0, sel && [sel.hp > 0, sel.linked, sel.dev, sel.level, sel.placed, sel.taken, sel.discovered], state.beings.map(b => b.placed + b.id)]);
  if (!force && signature === uiSignature) return;
  uiSignature = signature;

  const roster = $('roster'); roster.replaceChildren();
  for (const b of state.beings.filter(x => !x.placed)) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (placing === b.id ? ' placing' : ''); chip.dataset.being = b.id;
    chip.innerHTML = '<span class="dot"></span><span></span><small></small>';
    chip.children[0].style.color = BEINGS[b.identity].color;
    chip.children[1].textContent = BEINGS[b.identity].name;
    chip.children[2].textContent = b.dev.mastery > 1 || b.dev.subdivision || b.dev.octave || b.dev.reach ? `M${b.dev.mastery}` : 'place';
    roster.append(chip);
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
  localStorage.removeItem(RUN_KEY);
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
  state = S.newRun(meta);
  selectedId = null; placing = null; ghost = null;
  stage.fx = []; stage.vib.clear();
  $('fall').hidden = true;
  save(); renderUi(true);
  banner('A new performance');
});

$('begin').addEventListener('click', async () => {
  try { await sound.start(); } catch { toast('Sound could not start here; the game runs silently.'); }
  lastAudio = sound.now; lastPerf = performance.now();
  offset = sound.now - state.time + LATENCY;
  sound.setTempo(S.bpm(state));
  started = true;
  state.paused = false;
  $('curtain').hidden = true;
  if (awayEarned >= 1) toast('While you were away, the wells gathered +' + fmt(awayEarned) + '.');
  if (state.motifOffer) openMotif();
  tutorial();
});

$('sound').addEventListener('click', () => { sound.setMuted(!sound.muted); $('sound').setAttribute('aria-pressed', String(sound.muted)); });
$('pause').addEventListener('click', () => { state.paused = !state.paused; renderUi(true); });

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
  const hint = $('hint');
  while (meta.tutorial < LESSONS.length && LESSONS[meta.tutorial].done()) meta.tutorial++;
  if (meta.tutorial >= LESSONS.length || meta.runs > 0) { hint.hidden = true; return; }
  hint.textContent = LESSONS[meta.tutorial].text; hint.hidden = false;
}
setInterval(tutorial, 1000);

if (awayEarned >= 1) $('curtain-text').textContent = 'Welcome back. While you were away the wells gathered +' + fmt(awayEarned) + ' Resonance. The Hush waited.';
else if (meta.runs > 0 || state.wave > 0) $('curtain-text').textContent = 'The orchestra is where you left it.';
$('begin').textContent = state.wave > 0 || awayEarned > 0 ? 'Return' : 'Begin';

let lastBpm = S.bpm(state);
setInterval(() => { const b = S.bpm(state); if (b !== lastBpm) { lastBpm = b; sound.setTempo(b); } }, 500);

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

window.__resonance = { get state() { return state; }, S, stage, sound };
renderUi(true);
requestAnimationFrame(frame);
