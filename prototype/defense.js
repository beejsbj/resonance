/* ResonanceDefense: DOM-free state transitions for the merged play study. */
(function (root) {
  'use strict';

  const W = 360;
  const H = 520;
  const BEAT = 0.625;
  const CENTER = { x: 180, y: 252 };
  const DEPOSITS = [
    { id: 'heart', x: 180, y: 316, protected: true },
    { id: 'outer', x: 72, y: 126, protected: false }
  ];
  const TOWERS = {
    violin: { name: 'Violin', cost: 40, hp: 30, range: 138, damage: 6, every: 2, color: '#dfb3ee' },
    drum: { name: 'Pulse drum', cost: 70, hp: 45, range: 108, damage: 4, every: 1, color: '#e7aebf' },
    bell: { name: 'Bell', cost: 100, hp: 30, range: 154, damage: 10, every: 4, color: '#f4ce9e' }
  };
  const WAVES = [
    { block: 10, runner: 0, armored: 0, reward: 10 },
    { block: 14, runner: 2, armored: 0, reward: 15 },
    { block: 15, runner: 5, armored: 0, reward: 20 },
    { block: 16, runner: 4, armored: 4, reward: 25 },
    { block: 20, runner: 8, armored: 4, reward: 30 },
    { block: 25, runner: 10, armored: 5, reward: 40 }
  ];
  const POWER_CHOICES = {
    echo: { id: 'echo', name: 'Reverberating gust', description: 'Every swipe returns one beat later as a softer second push.' },
    linger: { id: 'linger', name: 'Lingering ward', description: 'Your ward remains for two seconds after you lift your hand.' }
  };

  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const towerDefinition = type => TOWERS[type] || null;
  const structureById = (state, id) => state.towers.find(t => t.id === id) || state.mines.find(m => m.id === id) || null;
  const liveStructures = state => state.towers.concat(state.mines.filter(m => !m.protected && m.level > 0)).filter(s => s.hp > 0);

  function initial() {
    return {
      version: 2,
      seed: 1937,
      resonance: 20,
      lifetimeResonance: 20,
      elapsed: 0,
      tempo: 96,
      beatPhase: 0,
      beatIndex: 0,
      status: 'build',
      resumeStatus: null,
      wave: 0,
      spawned: 0,
      toSpawn: [],
      spawnClock: 0,
      endless: 0,
      conductor: { hp: 100, maxHp: 100, power: 100, maxPower: 100, chorus: 0, voiceCooldown: 0 },
      mines: [
        { id: 'mine-heart', deposit: 'heart', x: 180, y: 316, level: 1, hp: 999, maxHp: 999, protected: true, accent: false, invested: 0 },
        { id: 'mine-outer', deposit: 'outer', x: 72, y: 126, level: 0, hp: 40, maxHp: 40, protected: false, accent: false, invested: 0 }
      ],
      towers: [
        { id: 'tower-1', type: 'violin', x: 226, y: 252, hp: 30, maxHp: 30, tier: 1, electric: false, accents: 0, invested: 0 }
      ],
      enemies: [],
      boss: null,
      ward: null,
      powerChoice: null,
      echo: null,
      nextId: 2,
      messages: ['The heart mine keeps time. The first violin is listening.']
    };
  }

  function validState(value) {
    const finite = (...values) => values.every(Number.isFinite);
    const point = item => item && finite(item.x, item.y);
    const structure = item => item && typeof item.id === 'string' && finite(item.x, item.y, item.hp, item.maxHp) && item.maxHp > 0;
    const tower = item => structure(item) && !!towerDefinition(item.type) && finite(item.tier, item.accents, item.invested) && item.tier >= 1;
    const mine = item => structure(item) && typeof item.deposit === 'string' && finite(item.level, item.invested) && item.level >= 0;
    const enemy = item => structure(item) && typeof item.type === 'string' && finite(item.speed, item.armor, item.slow, item.attackPhase);
    const conductor = value?.conductor;
    const statuses = ['build', 'paused', 'wave', 'choice', 'bossReady', 'boss', 'endless', 'defeated'];
    const ids = value && Array.isArray(value.towers) && Array.isArray(value.mines) ? value.towers.concat(value.mines).map(item => item.id) : [];
    return !!(value && value.version === 2 && finite(value.seed, value.resonance, value.lifetimeResonance, value.elapsed, value.beatPhase, value.beatIndex, value.wave, value.spawned, value.spawnClock, value.endless, value.nextId)
      && statuses.includes(value.status) && (value.resumeStatus == null || ['wave', 'boss'].includes(value.resumeStatus))
      && conductor && finite(conductor.hp, conductor.maxHp, conductor.power, conductor.maxPower, conductor.chorus, conductor.voiceCooldown) && conductor.maxHp > 0 && conductor.maxPower > 0
      && Array.isArray(value.toSpawn) && value.toSpawn.every(type => ['block', 'runner', 'armored'].includes(type))
      && Array.isArray(value.towers) && value.towers.every(tower)
      && Array.isArray(value.mines) && value.mines.every(mine)
      && Array.isArray(value.enemies) && value.enemies.every(enemy)
      && (value.boss == null || (structure(value.boss) && finite(value.boss.attackClock, value.boss.telegraph, value.boss.angle)))
      && (value.ward == null || (point(value.ward) && finite(value.ward.radius, value.ward.until)))
      && (value.echo == null || (point(value.echo.start) && point(value.echo.end) && Number.isFinite(value.echo.delay)))
      && (value.powerChoice == null || !!POWER_CHOICES[value.powerChoice])
      && ids.length === new Set(ids).size);
  }

  function beatDuration(state) {
    return 60 / clamp(state.tempo || 96, 60, 132);
  }

  function setTempo(input, tempo) {
    const state = clone(input);
    state.tempo = clamp(tempo, 60, 132);
    return state;
  }

  function mineRate(state, includeChorus = true) {
    const chorus = includeChorus && state.conductor.chorus > 0 ? 1.25 : 1;
    return state.mines.reduce((sum, mine) => mine.hp > 0 && mine.level > 0 ? sum + mine.level * 4 / (beatDuration(state) * 4) : sum, 0) * chorus;
  }

  function buildCost(state, type) {
    const def = towerDefinition(type);
    if (!def) return Infinity;
    const copies = state.towers.filter(t => t.type === type).length;
    return Math.ceil(def.cost * Math.pow(1.4, Math.max(0, copies - (type === 'violin' ? 1 : 0))));
  }

  function mineCost(state) {
    const mine = state.mines.find(m => m.deposit === 'outer');
    return mine && mine.level === 0 ? 60 : Infinity;
  }

  function placementReason(state, type, x, y) {
    if (!towerDefinition(type)) return 'Unknown instrument.';
    if (state.towers.length >= 6) return 'This study holds six instrument towers.';
    if (x < 24 || x > W - 24 || y < 54 || y > H - 28) return 'Place inside the arena.';
    if (distance({ x, y }, CENTER) < 54) return 'Leave the conductor room to sing.';
    for (const s of state.towers.concat(state.mines)) if (s.hp > 0 && distance({ x, y }, s) < 42) return 'Give each structure a little breathing room.';
    return '';
  }

  function placeTower(input, type, x, y) {
    const state = clone(input);
    const cost = buildCost(state, type);
    const reason = placementReason(state, type, x, y);
    if (reason) return { state, ok: false, message: reason, events: [] };
    if (state.resonance < cost) return { state, ok: false, message: 'Not enough Resonance.', events: [] };
    const def = towerDefinition(type);
    state.resonance -= cost;
    state.towers.push({ id: 'tower-' + state.nextId++, type, x: clamp(x, 24, W - 24), y: clamp(y, 54, H - 28), hp: def.hp, maxHp: def.hp, tier: 1, electric: false, accents: 0, invested: cost });
    return { state, ok: true, message: def.name + ' joined the orchestra.', events: [{ type: 'built', voice: type }] };
  }

  function buildMine(input) {
    const state = clone(input);
    const mine = state.mines.find(m => m.deposit === 'outer');
    if (!mine || mine.level > 0) return { state, ok: false, message: 'The outer deposit is already singing.', events: [] };
    if (state.resonance < 60) return { state, ok: false, message: 'The outer mine needs 60 Resonance.', events: [] };
    state.resonance -= 60;
    mine.level = 1;
    mine.hp = mine.maxHp;
    mine.invested = 60;
    return { state, ok: true, message: 'The outer mine joined the beat.', events: [{ type: 'mineBuilt', x: mine.x, y: mine.y }] };
  }

  function upgradeMine(input, id) {
    const state = clone(input);
    const mine = structureById(state, id);
    if (!mine || !String(mine.id).startsWith('mine-') || mine.level < 1) return { state, ok: false, message: 'Select a working mine.', events: [] };
    if (mine.level >= 2) return { state, ok: false, message: 'This mine is fully developed in the study.', events: [] };
    if (state.resonance < 80) return { state, ok: false, message: 'The mine expansion needs 80 Resonance.', events: [] };
    state.resonance -= 80; mine.level = 2; mine.invested += 80;
    return { state, ok: true, message: 'The mine now answers every bar with a second pulse.', events: [{ type: 'mineUpgrade', x: mine.x, y: mine.y }] };
  }

  function upgradeTower(input, id, kind) {
    const state = clone(input);
    const tower = structureById(state, id);
    if (!tower || !towerDefinition(tower.type)) return { state, ok: false, message: 'Select an instrument tower.', events: [] };
    if (tower.hp <= 0) return { state, ok: false, message: 'Rebuild this instrument first.', events: [] };
    let cost = Infinity;
    if (kind === 'section') cost = tower.tier === 1 ? 45 : tower.tier === 2 ? 90 : Infinity;
    if (kind === 'electric') cost = tower.tier >= 2 && !tower.electric ? 120 : Infinity;
    if (!Number.isFinite(cost)) return { state, ok: false, message: kind === 'electric' ? 'Grow this instrument before electrifying it.' : 'This section is already full.', events: [] };
    if (state.resonance < cost) return { state, ok: false, message: 'Not enough Resonance.', events: [] };
    state.resonance -= cost; tower.invested += cost;
    if (kind === 'section') { tower.tier += 1; tower.maxHp += 8; tower.hp += 8; }
    else tower.electric = true;
    return { state, ok: true, message: towerDefinition(tower.type).name + (kind === 'electric' ? ' became electric.' : tower.tier === 2 ? ' became a pair.' : ' became a section.'), events: [{ type: 'towerUpgrade', tower: clone(tower) }] };
  }

  function repair(input, id) {
    const state = clone(input);
    const structure = structureById(state, id);
    if (!structure || structure.protected || structure.hp >= structure.maxHp) return { state, ok: false, message: 'Nothing here needs repair.', events: [] };
    const rebuilding = structure.hp <= 0;
    const cost = rebuilding ? Math.max(10, Math.ceil((structure.invested || 40) * 0.4)) : 10;
    if (state.resonance < cost) return { state, ok: false, message: 'Not enough Resonance.', events: [] };
    state.resonance -= cost;
    structure.hp = rebuilding ? structure.maxHp : Math.min(structure.maxHp, structure.hp + 10);
    return { state, ok: true, message: rebuilding ? 'The silent shape rejoined the orchestra.' : 'The structure was mended.', events: [{ type: 'repaired', x: structure.x, y: structure.y }] };
  }

  function chooseSpawn(state, wave) {
    const plan = WAVES[Math.min(wave, WAVES.length - 1)];
    const list = [];
    for (const type of ['armored', 'runner', 'block']) for (let i = 0; i < (plan[type] || 0); i++) list.push(type);
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(state) * (i + 1)); const t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
  }

  function startWave(input) {
    const state = clone(input);
    if (!['build', 'paused', 'endless'].includes(state.status)) return { state, ok: false, message: 'The orchestra is already under pressure.', events: [] };
    if (state.status === 'paused' && state.resumeStatus) { state.status = state.resumeStatus; state.resumeStatus = null; return { state, ok: true, message: 'The waiting movement resumes.', events: [{ type: 'resume' }] }; }
    if (state.wave >= 6 && state.status !== 'endless') return { state, ok: false, message: 'The crisis is waiting.', events: [] };
    state.status = 'wave'; state.wave += 1; state.spawned = 0; state.toSpawn = chooseSpawn(state, state.wave - 1); state.spawnClock = 0.25;
    return { state, ok: true, message: 'Wave ' + state.wave + ' begins.', events: [{ type: 'waveStart', wave: state.wave }] };
  }

  function beginBoss(input) {
    const state = clone(input);
    if (state.status !== 'bossReady') return { state, ok: false, message: 'The crisis is not ready.', events: [] };
    state.status = 'boss'; state.boss = { id: 'hush', x: 180, y: 90, hp: 900, maxHp: 900, shielded: false, shellBroken: false, attackClock: 8, telegraph: 0, angle: Math.PI / 2 };
    return { state, ok: true, message: 'The Hush enters. The conductor is needed.', events: [{ type: 'bossStart' }] };
  }

  function pause(input) {
    const state = clone(input);
    if (['wave', 'boss'].includes(state.status)) { state.resumeStatus = state.status; state.status = 'paused'; }
    state.ward = null;
    return state;
  }

  function settleAway(input, seconds) {
    const state = clone(input);
    seconds = clamp(seconds, 0, 60 * 60 * 8);
    const earned = mineRate(state, false) * seconds;
    state.resonance += earned; state.lifetimeResonance += earned;
    state.conductor.chorus = Math.max(0, state.conductor.chorus - seconds);
    state.conductor.voiceCooldown = Math.max(0, state.conductor.voiceCooldown - seconds);
    return { state, earned, seconds, events: earned ? [{ type: 'away', earned }] : [] };
  }

  function nextRandom(state) {
    state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
    return state.seed / 4294967296;
  }

  function spawnEnemy(state, type, wave) {
    const angle = nextRandom(state) * Math.PI * 2;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const tx = dx > 0 ? (W - 14 - CENTER.x) / dx : (14 - CENTER.x) / dx;
    const ty = dy > 0 ? (H - 18 - CENTER.y) / dy : (44 - CENTER.y) / dy;
    const scale = Math.min(Math.abs(tx), Math.abs(ty));
    const growth = Math.pow(1.15, Math.max(0, wave - 1));
    const spec = type === 'runner' ? { hp: 8, speed: 30, armor: 0 } : type === 'armored' ? { hp: 40, speed: 12, armor: 2 } : { hp: 12, speed: 18, armor: 0 };
    state.enemies.push({ id: 'enemy-' + state.nextId++, type, x: CENTER.x + dx * scale, y: CENTER.y + dy * scale, hp: Math.ceil(spec.hp * growth), maxHp: Math.ceil(spec.hp * growth), speed: spec.speed, armor: spec.armor, slow: 0, attackPhase: 0 });
  }

  function damageEnemy(enemy, amount) {
    enemy.hp -= Math.max(1, amount - (enemy.armor || 0));
  }

  function towerAttack(state, tower, events) {
    if (tower.hp <= 0) return;
    const def = towerDefinition(tower.type);
    const candidates = state.enemies.filter(e => e.hp > 0 && distance(e, tower) <= def.range).sort((a, b) => distance(a, CENTER) - distance(b, CENTER));
    if (state.boss && state.boss.hp > 0 && !state.boss.shielded && distance(state.boss, tower) <= def.range + 35) candidates.push(state.boss);
    if (!candidates.length) return;
    let damage = def.damage * (1 + (tower.tier - 1) * 0.35) * (tower.electric ? 1.25 : 1) * (state.conductor.chorus > 0 ? 1.25 : 1);
    if (tower.accents > 0) { damage *= 1.5; tower.accents -= 1; }
    if (tower.type === 'drum') {
      const target = candidates[0];
      const splash = state.enemies.slice();
      if (state.boss && state.boss.hp > 0 && !state.boss.shielded) splash.push(state.boss);
      for (const enemy of splash) if (enemy.hp > 0 && distance(enemy, target) <= 32 + (tower.tier - 1) * 7) damageEnemy(enemy, damage);
    } else if (tower.type === 'bell') {
      for (const enemy of candidates.slice(0, 2 + tower.tier)) damageEnemy(enemy, damage);
    } else {
      const count = tower.tier;
      for (const enemy of candidates.slice(0, count)) damageEnemy(enemy, damage);
      if (tower.electric && candidates[count]) damageEnemy(candidates[count], damage * 0.7);
    }
    events.push({ type: 'towerAttack', tower: clone(tower), target: clone(candidates[0]), damage });
  }

  function onBeat(state, events, combat) {
    state.beatIndex += 1;
    if (state.beatIndex % 4 === 0) {
      let payout = 0;
      for (const mine of state.mines) if (mine.level > 0 && mine.hp > 0) {
        let amount = 4 * mine.level * (state.conductor.chorus > 0 ? 1.25 : 1);
        if (mine.accent) { amount += 2; mine.accent = false; }
        payout += amount; events.push({ type: 'minePayout', mine: clone(mine), amount });
      }
      state.resonance += payout; state.lifetimeResonance += payout;
    }
    if (!combat) return;
    for (const tower of state.towers) {
      const def = towerDefinition(tower.type);
      if (def && state.beatIndex % def.every === 0) towerAttack(state, tower, events);
    }
  }

  function moveEnemies(state, dt, events) {
    const structures = liveStructures(state);
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.slow = Math.max(0, enemy.slow - dt);
      const blockers = structures.filter(s => s.hp > 0 && distance(enemy, s) < 22);
      if (blockers.length) {
        enemy.attackPhase += dt;
        if (enemy.attackPhase >= 1) {
          enemy.attackPhase -= 1;
          const target = blockers[0];
          const warded = state.ward && distance(state.ward, target) <= state.ward.radius;
          target.hp = Math.max(0, target.hp - 5 * (warded ? 0.2 : 1));
          events.push({ type: 'structureHit', target: clone(target) });
          if (target.hp <= 0) events.push({ type: 'structureDown', target: clone(target) });
        }
        continue;
      }
      const d = Math.max(1, distance(enemy, CENTER));
      const speed = enemy.speed * (enemy.slow > 0 ? 0.6 : 1);
      enemy.x += (CENTER.x - enemy.x) / d * speed * dt;
      enemy.y += (CENTER.y - enemy.y) / d * speed * dt;
      if (distance(enemy, CENTER) < 18) {
        state.conductor.hp = Math.max(0, state.conductor.hp - 10);
        enemy.hp = 0;
        events.push({ type: 'conductorHit' });
      }
    }
    state.enemies = state.enemies.filter(e => e.hp > 0);
  }

  function updateBoss(state, dt, events) {
    const boss = state.boss;
    if (!boss || boss.hp <= 0) return;
    const targets = liveStructures(state).sort((a, b) => distance(a, boss) - distance(b, boss));
    const destination = targets[0] || CENTER;
    const gap = distance(boss, destination);
    if (gap > (targets.length ? 78 : 10)) {
      const speed = boss.shielded ? 8 : 12;
      boss.x += (destination.x - boss.x) / Math.max(1, gap) * speed * dt;
      boss.y += (destination.y - boss.y) / Math.max(1, gap) * speed * dt;
    } else if (!targets.length) {
      state.conductor.hp = Math.max(0, state.conductor.hp - 18 * dt);
    }
    if (!boss.shielded && !boss.shellBroken && boss.hp <= boss.maxHp / 2) { boss.shielded = true; events.push({ type: 'bossShield' }); }
    boss.attackClock -= dt;
    if (boss.attackClock <= 3 && boss.telegraph <= 0) { boss.telegraph = 3; boss.angle = nextRandom(state) * Math.PI * 2; events.push({ type: 'bossTelegraph', angle: boss.angle }); }
    if (boss.telegraph > 0) boss.telegraph -= dt;
    if (boss.attackClock <= 0) {
      boss.attackClock = boss.shielded ? 8 : 10; boss.telegraph = 0;
      let hit = 0;
      for (const target of liveStructures(state)) {
        const angle = Math.atan2(target.y - CENTER.y, target.x - CENTER.x);
        const delta = Math.abs(Math.atan2(Math.sin(angle - boss.angle), Math.cos(angle - boss.angle)));
        if (delta < 0.7) {
          const warded = state.ward && distance(state.ward, target) <= state.ward.radius;
          target.hp = Math.max(0, target.hp - 24 * (warded ? 0.2 : 1)); hit += 1;
          if (target.hp <= 0) events.push({ type: 'structureDown', target: clone(target) });
        }
      }
      events.push({ type: 'bossStrike', angle: boss.angle, hit });
    }
  }

  function finishWave(state, events) {
    if (state.status !== 'wave' || state.toSpawn.length || state.enemies.length) return;
    const plan = WAVES[Math.min(state.wave - 1, WAVES.length - 1)];
    state.resonance += plan.reward; state.lifetimeResonance += plan.reward;
    if (state.wave === 3 && !state.powerChoice) state.status = 'choice';
    else if (state.wave === 6) state.status = 'bossReady';
    else if (state.wave > 6) state.status = 'endless';
    else state.status = 'build';
    events.push({ type: 'waveClear', wave: state.wave, reward: plan.reward });
  }

  function advance(input, seconds) {
    const state = clone(input); const events = [];
    seconds = clamp(seconds, 0, 0.1);
    const combat = ['wave', 'boss'].includes(state.status);
    state.elapsed += seconds;
    state.conductor.power = Math.min(state.conductor.maxPower, state.conductor.power + seconds * 10);
    state.conductor.chorus = Math.max(0, state.conductor.chorus - seconds);
    state.conductor.voiceCooldown = Math.max(0, state.conductor.voiceCooldown - seconds);
    if (state.ward) { state.ward.until -= seconds; if (state.ward.until <= 0) state.ward = null; }
    if (state.echo && combat) { state.echo.delay -= seconds; if (state.echo.delay <= 0) { applyGust(state, state.echo.start, state.echo.end, 0.5, events); state.echo = null; } }
    state.beatPhase += seconds;
    const beat = beatDuration(state);
    while (state.beatPhase >= beat) { state.beatPhase -= beat; onBeat(state, events, combat); }
    if (!combat) return { state, events };
    if (state.status === 'wave') {
      state.spawnClock -= seconds;
      if (state.toSpawn.length && state.spawnClock <= 0) { spawnEnemy(state, state.toSpawn.shift(), state.wave); state.spawnClock = Math.max(0.35, 0.8 - state.wave * 0.05); }
      moveEnemies(state, seconds, events); finishWave(state, events);
    } else {
      updateBoss(state, seconds, events);
      if (state.boss && state.boss.hp <= 0) { state.status = 'endless'; events.push({ type: 'bossDown' }); }
    }
    if (state.conductor.hp <= 0) { state.resumeStatus = state.status; state.status = 'defeated'; state.ward = null; events.push({ type: 'defeat' }); }
    return { state, events };
  }

  function spendPower(state, amount) {
    if (state.conductor.power < amount) return false;
    state.conductor.power -= amount; return true;
  }

  function tapPower(input, point) {
    const state = clone(input); const events = [];
    if (!spendPower(state, 6)) return { state, ok: false, message: 'The conductor needs a breath.', events };
    const targets = state.towers.concat(state.mines.filter(m => m.level > 0)).filter(s => s.hp > 0).sort((a, b) => distance(a, point) - distance(b, point));
    const target = targets[0];
    if (target) {
      if (String(target.id).startsWith('mine-')) target.accent = true;
      else target.accents = 2;
      events.push({ type: 'accent', target: clone(target), point });
      return { state, ok: true, message: String(target.id).startsWith('mine-') ? 'The next mine pulse is brighter.' : towerDefinition(target.type).name + ' carries your accent.', events };
    }
    return { state, ok: true, message: 'The conductor answers the empty field.', events: [{ type: 'accent', point }] };
  }

  function segmentDistance(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1) : 0;
    return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
  }

  function applyGust(state, start, end, strength, events) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    for (const enemy of state.enemies) if (segmentDistance(enemy, start, end) < 42) {
      enemy.x += dx / length * 45 * strength; enemy.y += dy / length * 45 * strength; enemy.slow = Math.max(enemy.slow, 2 * strength);
    }
    if (state.boss && state.boss.shielded && segmentDistance(state.boss, start, end) < 70) { state.boss.shielded = false; state.boss.shellBroken = true; events.push({ type: 'bossShellBreak' }); }
    events.push({ type: 'gust', start, end, strength });
  }

  function swipePower(input, start, end) {
    const state = clone(input); const events = [];
    if (!spendPower(state, 35)) return { state, ok: false, message: 'The conductor needs 35 power for a gust.', events };
    applyGust(state, start, end, 1, events);
    if (state.powerChoice === 'echo') state.echo = { start, end, delay: beatDuration(state) };
    return { state, ok: true, message: state.boss && state.boss.shellBroken ? 'The Hush opened.' : 'The orchestra leans into your gust.', events };
  }

  function holdPower(input, point, seconds) {
    const state = clone(input); const events = [];
    const cost = Math.max(0.5, seconds * 15);
    if (!spendPower(state, cost)) return { state, ok: false, message: 'The conductor needs a breath.', events };
    state.ward = { x: point.x, y: point.y, radius: 58, until: Math.max(0.3, seconds + (state.powerChoice === 'linger' ? 2 : 0)) };
    events.push({ type: 'ward', point });
    return { state, ok: true, message: 'Your ward shelters the orchestra.', events };
  }

  function sing(input) {
    const state = clone(input); const events = [];
    if (state.conductor.voiceCooldown > 0) return { state, ok: false, message: 'The voice is still echoing.', events };
    if (!spendPower(state, 45)) return { state, ok: false, message: 'The conductor needs 45 power to sing.', events };
    state.conductor.chorus = 10; state.conductor.voiceCooldown = 15;
    return { state, ok: true, message: 'The conductor sings above the orchestra.', events: [{ type: 'sing' }] };
  }

  function choosePower(input, id) {
    const state = clone(input);
    if (state.status !== 'choice' || !POWER_CHOICES[id]) return { state, ok: false, message: 'That choice is not waiting.', events: [] };
    state.powerChoice = id; state.status = 'build';
    return { state, ok: true, message: POWER_CHOICES[id].name + ' joined this performance.', events: [{ type: 'choice', id }] };
  }

  function retry(input) {
    const state = clone(input);
    if (state.status !== 'defeated') return { state, ok: false, message: 'The performance has not ended.', events: [] };
    const failedStatus = state.resumeStatus;
    state.conductor.hp = state.conductor.maxHp; state.conductor.power = state.conductor.maxPower; state.enemies = []; state.boss = null; state.ward = null; state.echo = null;
    for (const structure of state.towers.concat(state.mines)) if (!structure.protected && structure.hp <= 0) structure.hp = Math.max(1, structure.maxHp * 0.4);
    state.toSpawn = []; state.spawnClock = 0;
    if (failedStatus === 'wave') state.wave = Math.max(0, state.wave - 1);
    state.status = failedStatus === 'boss' ? 'bossReady' : 'build'; state.resumeStatus = null;
    return { state, ok: true, message: 'The base remains. The conductor raises the orchestra again.', events: [{ type: 'retry' }] };
  }

  function selectAt(state, point) {
    const candidates = state.towers.concat(state.mines.filter(m => m.level > 0));
    return candidates.filter(s => distance(s, point) < 28).sort((a, b) => distance(a, point) - distance(b, point))[0] || null;
  }

  root.ResonanceDefense = {
    W, H, BEAT, CENTER, DEPOSITS, TOWERS, WAVES, POWER_CHOICES,
    initial, validState, beatDuration, setTempo, mineRate, buildCost, mineCost, placementReason, placeTower, buildMine, upgradeMine, upgradeTower, repair,
    startWave, beginBoss, pause, settleAway, advance, tapPower, swipePower, holdPower, sing, choosePower, retry, selectAt
  };
}(typeof window !== 'undefined' ? window : globalThis));
