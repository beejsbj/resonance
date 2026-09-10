/* Prototype controller: joins defense state, stage, sound, and the workshop. */
(function () {
  'use strict';
  const D = window.ResonanceDefense;
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'resonance-orchestra-study-v2';
  const WORLD_AUDIO = {
    awakening: { mode: 'pentatonic', root: 50 },
    current: { mode: 'dorian', root: 50 },
    radiance: { mode: 'lydian', root: 55 }
  };
  const ICONS = { violin: '≋', drum: '◎', bell: '◇', mine: '✦' };
  const POWER_NAMES = { echo: 'Reverberating gust', linger: 'Lingering ward' };

  let state = D.initial();
  let awake = false;
  let starting = null;
  let muted = false;
  let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mode = 'build';
  let pendingBuild = null;
  let selectedId = 'tower-1';
  let tempo = 96;
  let world = 'awakening';
  let hiddenAt = 0;
  let lastFrame = performance.now();
  let lastRender = 0;
  let toastTimer = 0;
  let bannerTimer = 0;
  let saveTimer = 0;
  let restoredAway = 0;

  const audio = new ResonanceAudio(event => stage.flash(event.voice, event.degree, event.velocity, event.automatic));
  const stage = new ResonanceStage($('stage'), gesture);

  const fmt = (value, precision = 1) => {
    if (!Number.isFinite(value)) return '—';
    if (value >= 1e9) return (value / 1e9).toFixed(2) + 'b';
    if (value >= 1e6) return (value / 1e6).toFixed(2) + 'm';
    if (value >= 10000) return (value / 1000).toFixed(1) + 'k';
    return Number(value.toFixed(precision)).toLocaleString('en-US');
  };

  function load() {
    try {
      const envelope = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!envelope || !D.validState(envelope.state) || !Number.isFinite(envelope.savedAt)) return;
      state = D.setTempo(D.pause(envelope.state), envelope.state.tempo || 96);
      const settled = D.settleAway(state, Math.max(0, (Date.now() - envelope.savedAt) / 1000));
      state = settled.state;
      tempo = state.tempo;
      restoredAway = settled.earned;
      selectedId = state.towers.find(t => t.hp > 0)?.id || state.mines.find(m => m.level > 0)?.id || null;
    } catch {}
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: hiddenAt || Date.now(), state })); } catch {}
  }

  function clearSave() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function toast(text) {
    $('toast').textContent = text;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2800);
  }

  function banner(text) {
    $('arena-banner').textContent = text;
    $('arena-banner').classList.add('visible');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => $('arena-banner').classList.remove('visible'), 2300);
  }

  function voiceLevels() {
    const alive = type => state.towers.filter(t => t.type === type && t.hp > 0);
    const tier = towers => towers.reduce((highest, tower) => Math.max(highest, tower.tier), 0);
    const violin = alive('violin');
    const drum = alive('drum');
    const bell = alive('bell');
    const electric = state.towers.filter(tower => tower.hp > 0 && tower.electric);
    return { bloom: 1, string: tier(violin), bell: tier(bell), pulse: tier(drum) || 0.45, electric: tier(electric), pad: 0.55 + Math.min(1.4, state.towers.length * 0.14), conductor: 1 };
  }

  function syncAudio(syncTransport = false) {
    const current = WORLD_AUDIO[world];
    audio.setConfig({ bpm: tempo, root: current.root, mode: current.mode, levels: voiceLevels(), density: 0.82, volume: 0.66, muted, playing: awake });
    if (syncTransport && awake) audio.syncTransport(state.beatIndex, state.beatPhase, D.beatDuration(state));
  }

  async function awaken() {
    if (awake) {
      if (audio.getDiagnostics().contextState === 'suspended') await audio.start();
      return true;
    }
    if (starting) return starting;
    starting = (async () => {
      try {
        await audio.start();
        awake = true;
        $('start-prompt').hidden = true;
        syncAudio(true);
        if (restoredAway > 0) { toast('Your mines gathered +' + fmt(restoredAway) + ' Resonance while you were away.'); restoredAway = 0; }
        audio.play('string', 2, 0.5, 1.1);
        return true;
      } catch {
        toast('Sound could not start here. Try Chrome or Safari. The game can still run silently.');
        return false;
      } finally { starting = null; }
    })();
    return starting;
  }

  function eventSound(event) {
    if (!awake) return;
    if (event.type === 'towerAttack') {
      const voice = event.tower.electric ? 'electric' : event.tower.type === 'violin' ? 'string' : event.tower.type === 'drum' ? 'pulse' : 'bell';
      audio.play(voice, (state.beatIndex + event.tower.tier * 2) % 9, event.tower.electric ? 0.62 : 0.46, voice === 'bell' ? 1.1 : voice === 'electric' ? 0.72 : 0.38);
    } else if (event.type === 'minePayout') audio.play('bloom', event.mine.level > 1 ? 3 : 0, 0.32, 0.75);
    else if (event.type === 'accent') audio.play('conductor', 4, 0.42, 0.36);
    else if (event.type === 'gust') { audio.play('conductor', 7, 0.5, 0.55); audio.play('string', 9, 0.34, 0.42); }
    else if (event.type === 'sing') { [0, 2, 4].forEach((degree, index) => setTimeout(() => audio.play('conductor', degree, 0.62 - index * 0.08, 2.4), index * 150)); }
    else if (event.type === 'bossStart') audio.play('pulse', -7, 0.8, 1.1);
    else if (event.type === 'bossShield') audio.play('pad', -2, 0.65, 3.5);
    else if (event.type === 'bossShellBreak') { audio.play('conductor', 7, 0.72, 2); audio.play('bell', 14, 0.65, 2); }
    else if (event.type === 'bossDown') { [0, 4, 7, 11].forEach((degree, index) => setTimeout(() => audio.play(index === 3 ? 'bell' : 'string', degree, 0.62, 2.2), index * 120)); }
    else if (event.type === 'structureDown') audio.play('pad', -5, 0.4, 2.4);
    else if (event.type === 'conductorHit') audio.play('pulse', -9, 0.58, 0.45);
  }

  function processEvents(events) {
    for (const event of events) {
      if (['towerAttack', 'minePayout', 'accent', 'gust', 'ward', 'bossStrike'].includes(event.type)) stage.effect(event);
      eventSound(event);
      if (event.type === 'waveStart') banner('Wave ' + event.wave + ' · the movement begins');
      else if (event.type === 'waveClear') toast('Wave ' + event.wave + ' resolved · +' + event.reward + ' Resonance');
      else if (event.type === 'bossShield') banner('THE HUSH CLOSES · swipe through it');
      else if (event.type === 'bossShellBreak') banner('THE SHELL BREAKS · the orchestra surges');
      else if (event.type === 'bossDown') banner('THE HUSH BECOMES MUSIC');
      else if (event.type === 'structureDown') toast('A structure fell silent. Rebuild it from Orchestra.');
      else if (event.type === 'defeat') openDefeat();
    }
    if (events.some(event => ['built', 'towerUpgrade', 'repaired', 'structureDown'].includes(event.type))) syncAudio();
  }

  function apply(result, announce = true) {
    state = result.state;
    processEvents(result.events || []);
    if (announce && result.message) toast(result.message);
    save();
    render();
    return result;
  }

  async function gesture(event) {
    if (event.kind === 'holdend') { audio.release(event.id); return; }
    if (mode === 'build') {
      if (event.kind !== 'tap') return;
      if (pendingBuild) {
        const result = D.placeTower(state, pendingBuild, event.point.x, event.point.y);
        if (result.ok) { pendingBuild = null; document.querySelectorAll('[data-build]').forEach(button => button.classList.remove('selected')); selectedId = result.state.towers.at(-1).id; }
        apply(result);
        return;
      }
      const selected = D.selectAt(state, event.point);
      if (selected) { selectedId = selected.id; selectTab('orchestra', false); render(); }
      else toast('Choose an instrument below, or tap a structure to inspect it.');
      return;
    }
    await awaken();
    if (event.kind.startsWith('hold') && !stage.isPointerActive(event.id)) return;
    if (event.kind === 'tap') apply(D.tapPower(state, event.point), false);
    else if (event.kind === 'swipe') apply(D.swipePower(state, event.start, event.end), false);
    else if (event.kind === 'holdstart') audio.hold(event.id, 'conductor', 0);
    else if (event.kind === 'holdmove') audio.moveHold(event.id, Math.round((event.point.x / D.W) * 7), 0.55);
    else if (event.kind === 'holdtick') apply(D.holdPower(state, event.point, event.seconds), false);
  }

  function pauseForWorkshop() {
    stage.releaseAll();
    if (['wave', 'boss'].includes(state.status)) {
      state = D.pause(state);
      banner('Danger waits while you build.');
      save();
    }
    mode = 'build';
  }

  function selectTab(tab, pause = true) {
    if (pause) pauseForWorkshop();
    document.querySelectorAll('[data-tab]').forEach(button => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.tab-panel').forEach(panel => { panel.hidden = panel.id !== 'tab-' + tab; });
    render();
  }

  function selectedStructure() {
    return state.towers.find(t => t.id === selectedId) || state.mines.find(m => m.id === selectedId) || null;
  }

  function selectionName(structure) {
    if (!structure) return '';
    if (String(structure.id).startsWith('mine-')) return structure.protected ? 'Heart mine' : structure.level > 1 ? 'Expanded outer mine' : 'Outer mine';
    const prefix = structure.tier === 1 ? 'Solo ' : structure.tier === 2 ? 'Paired ' : 'Sectional ';
    return prefix + D.TOWERS[structure.type].name.toLowerCase() + (structure.electric ? ' · electric' : '');
  }

  function renderSelection() {
    const structure = selectedStructure();
    $('selection-empty').hidden = !!structure;
    $('selection-card').hidden = !structure;
    if (!structure) return;
    const isMine = String(structure.id).startsWith('mine-');
    $('selection-emblem').textContent = isMine ? ICONS.mine : ICONS[structure.type];
    $('selection-name').textContent = selectionName(structure);
    $('selection-role').textContent = isMine ? (structure.level * 4) + ' Resonance every four beats' : D.TOWERS[structure.type].name + ' · ' + (structure.type === 'violin' ? 'focus' : structure.type === 'drum' ? 'area' : 'chain');
    $('selection-health').textContent = structure.protected ? 'protected' : Math.ceil(structure.hp) + ' / ' + structure.maxHp;
    $('grow-section').hidden = isMine;
    $('go-electric').hidden = isMine;
    if (isMine) {
      $('repair').innerHTML = structure.hp <= 0 ? 'Rebuild <span>✧ ' + Math.max(10, Math.ceil((structure.invested || 40) * 0.4)) + '</span>' : structure.level < 2 ? 'Expand mine <span>✧ 80</span>' : 'Repair <span>✧ 10</span>';
      $('repair').disabled = structure.protected && structure.level >= 2 || (structure.level >= 2 && structure.hp >= structure.maxHp);
    } else {
      const sectionCost = structure.tier === 1 ? 45 : structure.tier === 2 ? 90 : Infinity;
      $('grow-section').innerHTML = structure.tier === 1 ? 'Grow pair <span>✧ 45</span>' : structure.tier === 2 ? 'Grow section <span>✧ 90</span>' : 'Full section <span>—</span>';
      $('grow-section').disabled = !Number.isFinite(sectionCost) || state.resonance < sectionCost || structure.hp <= 0;
      $('go-electric').innerHTML = structure.electric ? 'Electric <span>active</span>' : 'Go electric <span>✧ 120</span>';
      $('go-electric').disabled = structure.electric || structure.tier < 2 || state.resonance < 120 || structure.hp <= 0;
      const repairCost = structure.hp <= 0 ? Math.max(10, Math.ceil((structure.invested || 40) * 0.4)) : 10;
      $('repair').innerHTML = structure.hp <= 0 ? 'Rebuild <span>✧ ' + repairCost + '</span>' : 'Repair <span>✧ 10</span>';
      $('repair').disabled = structure.hp >= structure.maxHp || state.resonance < repairCost;
    }
  }

  function waveText() {
    if (state.status === 'paused') return { label: 'MOVEMENT WAITING', detail: state.resumeStatus === 'boss' ? 'The crisis is paused' : 'Wave ' + state.wave + ' is paused', action: 'Resume movement', disabled: false };
    if (state.status === 'wave') return { label: 'WAVE ' + state.wave, detail: (state.enemies.length + state.toSpawn.length) + ' threats remain', action: 'Wave active', disabled: true };
    if (state.status === 'choice') return { label: 'EVOLUTION', detail: 'Choose a conductor power', action: 'Choice waiting', disabled: true };
    if (state.status === 'bossReady') return { label: 'CRISIS READY', detail: 'The Hush waits for you', action: 'Begin crisis', disabled: false };
    if (state.status === 'boss') return { label: 'THE HUSH', detail: state.boss?.shielded ? 'Swipe through the shell' : 'Protect the orchestra', action: 'Crisis active', disabled: true };
    if (state.status === 'endless') return { label: 'ENCORE', detail: 'The orchestra continues', action: 'Begin wave ' + (state.wave + 1), disabled: false };
    if (state.status === 'defeated') return { label: 'FALLEN QUIET', detail: 'The base remembers', action: 'Raise the orchestra', disabled: false };
    return { label: 'BUILDING INTERLUDE', detail: 'Before wave ' + (state.wave + 1), action: 'Begin wave ' + (state.wave + 1), disabled: false };
  }

  function render() {
    $('balance').textContent = fmt(state.resonance);
    $('rate').textContent = fmt(D.mineRate(state));
    $('health').textContent = Math.ceil(state.conductor.hp);
    $('power').textContent = Math.floor(state.conductor.power);
    $('power-fill').style.width = state.conductor.power / state.conductor.maxPower * 100 + '%';
    $('sing').disabled = state.conductor.power < 45 || state.conductor.voiceCooldown > 0 || mode !== 'conduct';
    $('sing').querySelector('small').textContent = state.conductor.voiceCooldown > 0 ? Math.ceil(state.conductor.voiceCooldown) + 's' : '45';
    const wave = waveText();
    $('movement-label').textContent = wave.label;
    $('wave-label').textContent = wave.detail;
    $('wave-action').textContent = wave.action;
    $('wave-action').disabled = wave.disabled;
    $('resume').hidden = state.status !== 'paused';
    $('cost-violin').textContent = fmt(D.buildCost(state, 'violin'), 0);
    $('cost-drum').textContent = fmt(D.buildCost(state, 'drum'), 0);
    $('cost-bell').textContent = fmt(D.buildCost(state, 'bell'), 0);
    $('cost-mine').textContent = Number.isFinite(D.mineCost(state)) ? '60' : 'built';
    document.querySelectorAll('[data-build]').forEach(button => {
      const type = button.dataset.build;
      button.disabled = state.resonance < D.buildCost(state, type) || state.towers.length >= 6;
      button.classList.toggle('selected', pendingBuild === type);
    });
    $('build-mine').disabled = !Number.isFinite(D.mineCost(state)) || state.resonance < 60;
    $('build-hint').textContent = pendingBuild ? 'Tap open space to place the ' + D.TOWERS[pendingBuild].name.toLowerCase() + '.' : mode === 'conduct' ? 'Conduct mode · your gestures support the orchestra.' : 'Choose an instrument, then place it in the arena.';
    renderSelection();
    $('status-line').textContent = state.powerChoice ? POWER_NAMES[state.powerChoice] + ' shapes this performance.' : state.status === 'build' ? 'The mines keep growing while danger waits.' : 'The orchestra plays; you lend it support.';
    stage.configure(state, { mode, pendingBuild, selectedId, reduced });
    if (state.status === 'choice' && !$('choice-dialog').open) $('choice-dialog').showModal();
    if (state.status !== 'choice' && $('choice-dialog').open) $('choice-dialog').close();
  }

  function openDefeat() {
    if (!$('defeat-dialog').open) $('defeat-dialog').showModal();
  }

  function startOrResume() {
    if (state.status === 'defeated') { openDefeat(); return; }
    const result = state.status === 'bossReady' ? D.beginBoss(state) : D.startWave(state);
    if (result.ok) { mode = 'conduct'; pendingBuild = null; void awaken(); }
    apply(result);
  }

  function reset() {
    clearSave();
    state = D.initial();
    selectedId = 'tower-1'; pendingBuild = null; mode = 'build'; world = 'awakening'; tempo = 96;
    stage.clear();
    document.querySelectorAll('[data-build]').forEach(button => button.classList.remove('selected'));
    selectTab('build', false);
    syncAudio(); save(); render(); toast('The study begins again from its first violin.');
  }

  function scenario(which) {
    state = D.initial();
    if (which !== 'first') {
      state.resonance = which === 'boss' ? 520 : 280;
      state.lifetimeResonance = state.resonance;
      state.mines[1].level = 2; state.mines[1].hp = 40; state.mines[1].invested = 140;
      state.towers[0].tier = which === 'boss' ? 3 : 2; state.towers[0].electric = which === 'boss'; state.towers[0].invested = which === 'boss' ? 255 : 45;
      state.towers.push({ id: 'tower-2', type: 'drum', x: 118, y: 248, hp: 53, maxHp: 53, tier: 2, electric: false, accents: 0, invested: 140 });
      state.towers.push({ id: 'tower-3', type: 'bell', x: 180, y: 164, hp: 38, maxHp: 38, tier: 2, electric: false, accents: 0, invested: 190 });
      state.nextId = which === 'boss' ? 5 : 4; state.wave = which === 'boss' ? 6 : 3; state.status = which === 'boss' ? 'bossReady' : 'build'; state.powerChoice = which === 'boss' ? 'echo' : null;
      if (which === 'boss') state.towers.push({ id: 'tower-4', type: 'violin', x: 260, y: 180, hp: 38, maxHp: 38, tier: 2, electric: true, accents: 0, invested: 205 });
    }
    selectedId = 'tower-1'; pendingBuild = null; mode = 'build'; stage.clear(); syncAudio(); save(); render(); toast(which === 'first' ? 'First defense.' : which === 'growing' ? 'A growing orchestra.' : 'The crisis is ready when you are.');
  }

  $('awaken').addEventListener('click', awaken);
  $('mute').addEventListener('click', () => { muted = !muted; $('mute').textContent = muted ? '♩̸' : '♫'; $('mute').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound'); syncAudio(); });
  $('motion').addEventListener('click', () => { reduced = !reduced; $('motion').textContent = reduced ? 'Full motion' : 'Gentle motion'; $('motion').setAttribute('aria-pressed', String(reduced)); render(); });
  $('sing').addEventListener('click', async () => { await awaken(); apply(D.sing(state)); });
  $('wave-action').addEventListener('click', startOrResume);
  $('resume').addEventListener('click', startOrResume);
  $('conduct-mode').addEventListener('click', () => { mode = 'conduct'; if (state.status === 'paused') apply(D.startWave(state), false); else render(); selectTab('build', false); });
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  document.querySelectorAll('[data-build]').forEach(button => button.addEventListener('click', () => { pauseForWorkshop(); pendingBuild = button.dataset.build; document.querySelectorAll('[data-build]').forEach(other => other.classList.toggle('selected', other === button)); render(); }));
  $('build-mine').addEventListener('click', () => { const result = D.buildMine(state); if (result.ok) selectedId = 'mine-outer'; apply(result); });
  $('grow-section').addEventListener('click', () => { const structure = selectedStructure(); if (structure) apply(D.upgradeTower(state, structure.id, 'section')); });
  $('go-electric').addEventListener('click', () => { const structure = selectedStructure(); if (structure) apply(D.upgradeTower(state, structure.id, 'electric')); });
  $('repair').addEventListener('click', () => { const structure = selectedStructure(); if (!structure) return; apply(String(structure.id).startsWith('mine-') && structure.hp > 0 && structure.level < 2 ? D.upgradeMine(state, structure.id) : D.repair(state, structure.id)); });
  document.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => apply(D.choosePower(state, button.dataset.choice))));
  $('retry').addEventListener('click', () => { $('defeat-dialog').close(); apply(D.retry(state)); });
  $('tempo').addEventListener('input', event => { tempo = Number(event.target.value); state = D.setTempo(state, tempo); $('tempo-value').textContent = tempo + ' BPM'; syncAudio(true); save(); });
  $('world').addEventListener('change', event => { world = event.target.value; syncAudio(); toast('The orchestra entered a different modal colour.'); });
  $('grant').addEventListener('click', () => { state.resonance += 300; state.lifetimeResonance += 300; save(); render(); toast('+300 Resonance for tinkering.'); });
  $('away-two').addEventListener('click', () => apply({ ...D.settleAway(state, 120), ok: true, message: 'Two quiet minutes passed.' }));
  $('away-hour').addEventListener('click', () => apply({ ...D.settleAway(state, 3600), ok: true, message: 'The mines worked for an hour. Danger did not move.' }));
  document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => scenario(button.dataset.scenario)));
  $('reset').addEventListener('click', () => $('confirm-dialog').showModal());
  $('confirm-cancel').addEventListener('click', () => $('confirm-dialog').close());
  $('confirm-reset').addEventListener('click', () => { $('confirm-dialog').close(); reset(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stage.releaseAll(); state = D.pause(state); hiddenAt = Date.now(); save(); syncAudio();
    } else if (hiddenAt) {
      const settled = D.settleAway(state, (Date.now() - hiddenAt) / 1000); state = settled.state; hiddenAt = 0; save(); syncAudio(true); render();
      if (settled.earned > 0) toast('Your mines gathered +' + fmt(settled.earned) + ' while away. No battle time passed.');
    }
  });

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    if (!document.hidden) {
      const result = D.advance(state, dt); state = result.state; processEvents(result.events);
      if (now - lastRender > 100) { render(); lastRender = now; }
    }
    requestAnimationFrame(frame);
  }

  load();
  $('tempo').value = String(tempo);
  $('tempo-value').textContent = tempo + ' BPM';
  $('motion').textContent = reduced ? 'Full motion' : 'Gentle motion';
  $('motion').setAttribute('aria-pressed', String(reduced));
  syncAudio(); render();
  if (restoredAway > 0) $('start-prompt').querySelector('p').textContent = 'Your mines gathered +' + fmt(restoredAway) + ' while you were away.';
  requestAnimationFrame(frame);
  saveTimer = setInterval(() => { if (!document.hidden) save(); }, 3000);
  window.addEventListener('pagehide', () => { stage.releaseAll(); state = D.pause(state); hiddenAt ||= Date.now(); save(); });
  window.addEventListener('beforeunload', () => { clearInterval(saveTimer); audio.destroy(); stage.destroy(); });

  window.ResonancePrototype = {
    getState: () => JSON.parse(JSON.stringify(state)),
    getAudio: () => audio.getDiagnostics(),
    getMode: () => mode,
    startWave: startOrResume,
    settleAway: seconds => apply({ ...D.settleAway(state, seconds), ok: true, message: 'Away time settled.' }),
    scenario
  };
}());
