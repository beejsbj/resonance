/* Functional radial arena and exclusive pointer-gesture recognizer. */
(function () {
  'use strict';
  const D = window.ResonanceDefense;
  const COLORS = { violin: '#dfb3ee', drum: '#e7aebf', bell: '#f4ce9e', mine: '#b0e8db', conductor: '#a6bfee', enemy: '#ec9d92' };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  class ResonanceStage {
    constructor(canvas, onGesture) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.onGesture = onGesture;
      this.state = D.initial();
      this.options = { mode: 'conduct', pendingBuild: null, selectedId: null, reduced: false };
      this.effects = [];
      this.pointers = new Map();
      this.hover = null;
      this.width = 1;
      this.height = 1;
      this.scale = 1;
      this.ox = 0;
      this.oy = 0;
      this.time = 0;
      this.lastFrame = 0;
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas.parentElement);
      this.resize();
      this.bind();
      this.raf = requestAnimationFrame(time => this.draw(time));
    }

    configure(state, options) {
      this.state = state;
      this.options = { ...this.options, ...options };
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const density = Math.min(devicePixelRatio || 1, 2);
      this.width = Math.max(1, r.width);
      this.height = Math.max(1, r.height);
      this.canvas.width = Math.round(this.width * density);
      this.canvas.height = Math.round(this.height * density);
      this.ctx.setTransform(density, 0, 0, density, 0, 0);
      this.scale = Math.min(this.width / D.W, this.height / D.H);
      this.ox = (this.width - D.W * this.scale) / 2;
      this.oy = (this.height - D.H * this.scale) / 2;
    }

    point(event) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: clamp((event.clientX - r.left - this.ox) / this.scale, 0, D.W),
        y: clamp((event.clientY - r.top - this.oy) / this.scale, 0, D.H)
      };
    }

    bind() {
      const c = this.canvas;
      c.addEventListener('pointerdown', event => {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        event.preventDefault();
        c.focus({ preventScroll: true });
        c.setPointerCapture(event.pointerId);
        const p = this.point(event);
        this.pointers.set(event.pointerId, { id: event.pointerId, start: p, point: p, started: performance.now(), moved: false, holding: false, lastHold: performance.now() });
        this.effect({ type: 'contact', point: p });
      });
      c.addEventListener('pointermove', event => {
        const p = this.point(event);
        this.hover = p;
        const active = this.pointers.get(event.pointerId);
        if (!active) return;
        event.preventDefault();
        active.point = p;
        if (!active.holding && Math.hypot(p.x - active.start.x, p.y - active.start.y) > 24) active.moved = true;
        if (active.holding) this.onGesture({ kind: 'holdmove', id: active.id, point: p });
      });
      const end = event => {
        const active = this.pointers.get(event.pointerId);
        if (!active) return;
        const p = this.point(event);
        if (active.holding) this.onGesture({ kind: 'holdend', id: active.id, point: p });
        else if (active.moved) this.onGesture({ kind: 'swipe', id: active.id, start: active.start, end: p });
        else this.onGesture({ kind: 'tap', id: active.id, point: p });
        this.pointers.delete(event.pointerId);
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('lostpointercapture', event => {
        const active = this.pointers.get(event.pointerId);
        if (active?.holding) this.onGesture({ kind: 'holdend', id: active.id, point: active.point });
        this.pointers.delete(event.pointerId);
      });
      c.addEventListener('pointerleave', () => { if (!this.pointers.size) this.hover = null; });
      window.addEventListener('blur', () => this.releaseAll());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    }

    releaseAll() {
      for (const active of this.pointers.values()) if (active.holding) this.onGesture({ kind: 'holdend', id: active.id, point: active.point });
      this.pointers.clear();
    }

    effect(event) {
      const base = { ...event, born: performance.now(), life: event.type === 'gust' ? 720 : event.type === 'bossStrike' ? 900 : 620 };
      this.effects.push(base);
      if (this.effects.length > 90) this.effects.splice(0, this.effects.length - 90);
    }

    flash(voice, degree, velocity, automatic, point) {
      const kind = { string: 'violin', pulse: 'drum', bell: 'bell' }[voice];
      const tower = this.state.towers.find(t => kind === t.type && t.hp > 0);
      this.effect({ type: automatic ? 'music' : 'contact', point: point || tower || D.CENTER, color: COLORS[kind] || COLORS.conductor, quiet: automatic });
    }

    draw(now) {
      this.raf = requestAnimationFrame(time => this.draw(time));
      const dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
      this.lastFrame = now;
      if (document.hidden) return;
      this.time += dt;
      for (const active of this.pointers.values()) {
        if (!active.holding && !active.moved && performance.now() - active.started >= 350 && this.options.mode === 'conduct') {
          active.holding = true;
          this.onGesture({ kind: 'holdstart', id: active.id, point: active.point });
        }
        if (active.holding && performance.now() - active.lastHold > 150) {
          active.lastHold = performance.now();
          this.onGesture({ kind: 'holdtick', id: active.id, point: active.point, seconds: 0.15 });
        }
      }
      const c = this.ctx;
      c.clearRect(0, 0, this.width, this.height);
      c.save();
      c.translate(this.ox, this.oy);
      c.scale(this.scale, this.scale);
      this.drawField(c);
      this.drawDeposits(c);
      this.drawStructures(c);
      this.drawEnemies(c);
      this.drawConductor(c);
      this.drawGestures(c);
      this.drawEffects(c, now);
      this.drawBuildGhost(c);
      c.restore();
    }

    drawField(c) {
      const pulse = 1 - this.state.beatPhase / D.BEAT;
      c.fillStyle = '#10131d'; c.fillRect(0, 0, D.W, D.H);
      const glow = c.createRadialGradient(D.CENTER.x, D.CENTER.y, 10, D.CENTER.x, D.CENTER.y, 270);
      glow.addColorStop(0, '#26304488'); glow.addColorStop(0.55, '#171d2a66'); glow.addColorStop(1, '#0d111a00');
      c.fillStyle = glow; c.fillRect(0, 0, D.W, D.H);
      c.fillStyle = '#b0e8db14';
      for (let x = 18; x < D.W; x += 24) for (let y = 42; y < D.H; y += 24) { c.beginPath(); c.arc(x, y, 0.7, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = '#b0e8db10'; c.lineWidth = 1;
      for (const radius of [72, 132, 205]) { c.beginPath(); c.arc(D.CENTER.x, D.CENTER.y, radius + pulse * 2, 0, Math.PI * 2); c.stroke(); }
      if (this.state.boss?.telegraph > 0) {
        c.fillStyle = '#ec9d9222'; c.beginPath(); c.moveTo(D.CENTER.x, D.CENTER.y); c.arc(D.CENTER.x, D.CENTER.y, 300, this.state.boss.angle - 0.7, this.state.boss.angle + 0.7); c.closePath(); c.fill();
      }
    }

    drawDeposits(c) {
      for (const deposit of D.DEPOSITS) {
        const mine = this.state.mines.find(m => m.deposit === deposit.id);
        const working = mine?.level > 0 && mine.hp > 0;
        c.save(); c.translate(deposit.x, deposit.y);
        c.strokeStyle = working ? COLORS.mine : '#b0e8db55'; c.fillStyle = working ? '#b0e8db14' : '#b0e8db08'; c.lineWidth = working ? 1.5 : 1; c.setLineDash(working ? [] : [3, 5]);
        const r = 15 + (mine?.level || 0) * 3;
        c.beginPath();
        for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; const rr = r * (1 + 0.13 * Math.sin(a * 5 + this.time)); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
        c.closePath(); c.fill(); c.stroke(); c.setLineDash([]);
        if (working) { c.fillStyle = COLORS.mine; c.globalAlpha = 0.5; c.beginPath(); c.arc(0, 0, 3 + Math.sin(this.time * 3) * 1.2, 0, Math.PI * 2); c.fill(); }
        c.restore();
      }
    }

    drawStructures(c) {
      const all = this.state.towers.concat(this.state.mines.filter(m => m.level > 0 && !m.protected));
      for (const structure of all) {
        if (String(structure.id).startsWith('mine-')) { this.drawHealth(c, structure); continue; }
        const def = D.TOWERS[structure.type], selected = structure.id === this.options.selectedId;
        c.save(); c.translate(structure.x, structure.y); c.globalAlpha = structure.hp > 0 ? 1 : 0.28;
        if (selected) { c.strokeStyle = '#ffffffaa'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 24, 0, Math.PI * 2); c.stroke(); c.strokeStyle = def.color + '26'; c.beginPath(); c.arc(0, 0, def.range, 0, Math.PI * 2); c.stroke(); }
        c.strokeStyle = def.color; c.fillStyle = def.color + '18'; c.lineWidth = 1.5;
        if (structure.type === 'violin') {
          const lines = Math.min(3, structure.tier);
          for (let i = 0; i < lines; i++) { const ox = (i - (lines - 1) / 2) * 6; c.beginPath(); c.ellipse(ox, 0, 7, 18, -0.2, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(ox - 12, -13); c.lineTo(ox + 12, 13); c.stroke(); }
        } else if (structure.type === 'drum') {
          c.beginPath(); c.arc(0, 0, 15 + structure.tier * 2, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.stroke();
        } else {
          for (let i = 0; i < structure.tier; i++) { const ox = (i - (structure.tier - 1) / 2) * 7; c.beginPath(); c.moveTo(ox, -18); c.lineTo(ox + 12, 5); c.quadraticCurveTo(ox, 17, ox - 12, 5); c.closePath(); c.fill(); c.stroke(); }
        }
        if (structure.electric) { c.strokeStyle = '#9be7ff'; c.beginPath(); c.arc(0, 0, 22 + Math.sin(this.time * 5) * 2, 0, Math.PI * 2); c.stroke(); }
        if (structure.accents > 0) { c.strokeStyle = '#ffffffcc'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 27 + Math.sin(this.time * 7) * 2, 0, Math.PI * 2); c.stroke(); }
        c.restore(); this.drawHealth(c, structure);
      }
    }

    drawHealth(c, structure) {
      if (structure.protected || structure.hp >= structure.maxHp) return;
      const width = 32; c.fillStyle = '#0a0d14aa'; c.fillRect(structure.x - width / 2, structure.y + 23, width, 3); c.fillStyle = structure.hp > 0 ? '#b0e8db' : '#ec9d92'; c.fillRect(structure.x - width / 2, structure.y + 23, width * Math.max(0, structure.hp / structure.maxHp), 3);
    }

    drawEnemies(c) {
      for (const enemy of this.state.enemies) {
        c.save(); c.translate(enemy.x, enemy.y); const color = enemy.type === 'runner' ? '#f4ce9e' : enemy.type === 'armored' ? '#a6bfee' : COLORS.enemy;
        c.fillStyle = color + '2f'; c.strokeStyle = color; c.lineWidth = enemy.type === 'armored' ? 2 : 1;
        const r = enemy.type === 'runner' ? 7 : enemy.type === 'armored' ? 12 : 9;
        if (enemy.type === 'runner') { c.beginPath(); c.moveTo(0, -r); c.lineTo(r, r); c.lineTo(-r, r); c.closePath(); }
        else { c.beginPath(); c.rect(-r, -r * 0.75, r * 2, r * 1.5); }
        c.fill(); c.stroke();
        if (enemy.slow > 0) { c.strokeStyle = '#b0e8db88'; c.beginPath(); c.arc(0, 0, r + 5, 0, Math.PI * 2); c.stroke(); }
        c.restore();
        if (enemy.hp < enemy.maxHp) { c.fillStyle = '#ffffff1c'; c.fillRect(enemy.x - 10, enemy.y - 15, 20, 2); c.fillStyle = color; c.fillRect(enemy.x - 10, enemy.y - 15, 20 * enemy.hp / enemy.maxHp, 2); }
      }
      const boss = this.state.boss;
      if (boss && boss.hp > 0) {
        c.save(); c.translate(boss.x, boss.y); c.rotate(this.time * 0.18); c.strokeStyle = boss.shielded ? '#a6bfee' : '#ec9d92'; c.fillStyle = boss.shielded ? '#a6bfee18' : '#ec9d9218'; c.lineWidth = boss.shielded ? 3 : 1.5;
        for (let i = 0; i < 3; i++) { c.rotate(Math.PI / 3); c.beginPath(); c.rect(-23 - i * 3, -23 - i * 3, 46 + i * 6, 46 + i * 6); c.stroke(); }
        c.fillRect(-18, -18, 36, 36); c.restore();
        c.fillStyle = '#ffffff1c'; c.fillRect(70, 24, 220, 5); c.fillStyle = boss.shielded ? '#a6bfee' : '#ec9d92'; c.fillRect(70, 24, 220 * boss.hp / boss.maxHp, 5);
      }
    }

    drawConductor(c) {
      const p = D.CENTER, conductor = this.state.conductor;
      c.save(); c.translate(p.x, p.y);
      const glow = c.createRadialGradient(0, 0, 3, 0, 0, 42); glow.addColorStop(0, '#a6bfee42'); glow.addColorStop(1, '#a6bfee00'); c.fillStyle = glow; c.fillRect(-45, -45, 90, 90);
      c.strokeStyle = '#a6bfee'; c.fillStyle = '#a6bfee18'; c.lineWidth = 1.5;
      c.beginPath(); for (let i = 0; i <= 80; i++) { const a = i / 80 * Math.PI * 2; const r = 18 * (1 + 0.08 * Math.sin(a * 3 + this.time * 1.4)); const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); c.fill(); c.stroke();
      if (conductor.chorus > 0) { c.strokeStyle = '#ffffffaa'; for (let r = 28; r <= 44; r += 8) { c.globalAlpha = 1 - (r - 28) / 25; c.beginPath(); c.arc(0, 0, r + Math.sin(this.time * 4) * 2, -0.9, 0.9); c.stroke(); } }
      c.restore();
      c.strokeStyle = '#ffffff18'; c.lineWidth = 4; c.beginPath(); c.arc(p.x, p.y, 24, -Math.PI / 2, Math.PI * 1.5); c.stroke(); c.strokeStyle = conductor.hp > 35 ? '#b0e8db' : '#ec9d92'; c.beginPath(); c.arc(p.x, p.y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * conductor.hp / conductor.maxHp); c.stroke();
      if (this.state.ward) { c.fillStyle = '#b0e8db0d'; c.strokeStyle = '#b0e8dbaa'; c.lineWidth = 1.5; c.beginPath(); c.arc(this.state.ward.x, this.state.ward.y, this.state.ward.radius, 0, Math.PI * 2); c.fill(); c.stroke(); }
    }

    drawGestures(c) {
      for (const active of this.pointers.values()) {
        c.strokeStyle = active.holding ? '#b0e8dbaa' : '#ffffff55'; c.lineWidth = active.holding ? 2 : 1; c.beginPath(); c.moveTo(active.start.x, active.start.y); c.lineTo(active.point.x, active.point.y); c.stroke();
        if (active.holding) { c.fillStyle = '#b0e8db12'; c.beginPath(); c.arc(active.point.x, active.point.y, 58, 0, Math.PI * 2); c.fill(); }
      }
    }

    drawEffects(c, now) {
      this.effects = this.effects.filter(effect => now - effect.born < effect.life);
      for (const effect of this.effects) {
        const progress = clamp((now - effect.born) / effect.life, 0, 1), alpha = 1 - progress;
        c.globalAlpha = alpha; c.strokeStyle = effect.color || '#b0e8db'; c.fillStyle = effect.color || '#b0e8db'; c.lineWidth = effect.type === 'towerAttack' ? 2 : 1.5;
        if (effect.type === 'towerAttack') { c.beginPath(); c.moveTo(effect.tower.x, effect.tower.y); c.lineTo(effect.target.x, effect.target.y); c.stroke(); }
        else if (effect.type === 'gust') { c.lineWidth = 5 * effect.strength; c.beginPath(); c.moveTo(effect.start.x, effect.start.y); c.lineTo(effect.end.x, effect.end.y); c.stroke(); }
        else if (effect.type === 'minePayout') { c.beginPath(); c.arc(effect.mine.x, effect.mine.y, 8 + progress * 32, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(effect.mine.x, effect.mine.y); c.lineTo(D.CENTER.x, D.CENTER.y); c.stroke(); }
        else if (effect.type === 'bossStrike') { c.strokeStyle = '#ec9d92'; c.lineWidth = 3; c.beginPath(); c.arc(D.CENTER.x, D.CENTER.y, 70 + progress * 180, effect.angle - 0.7, effect.angle + 0.7); c.stroke(); }
        else { const p = effect.point || effect.target || D.CENTER; c.beginPath(); c.arc(p.x, p.y, 5 + progress * (effect.quiet ? 22 : 46), 0, Math.PI * 2); c.stroke(); }
        c.globalAlpha = 1;
      }
    }

    drawBuildGhost(c) {
      if (this.options.mode !== 'build' || !this.options.pendingBuild || !this.hover) return;
      const def = D.TOWERS[this.options.pendingBuild]; if (!def) return;
      const reason = D.placementReason(this.state, this.options.pendingBuild, this.hover.x, this.hover.y);
      c.globalAlpha = 0.5; c.strokeStyle = reason ? '#ec9d92' : def.color; c.setLineDash([4, 5]); c.beginPath(); c.arc(this.hover.x, this.hover.y, def.range, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.fillStyle = (reason ? '#ec9d92' : def.color) + '55'; c.beginPath(); c.arc(this.hover.x, this.hover.y, 16, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    }

    clear() { this.effects = []; this.releaseAll(); }
    destroy() { cancelAnimationFrame(this.raf); this.observer.disconnect(); this.releaseAll(); }
  }

  window.ResonanceStage = ResonanceStage;
}());
