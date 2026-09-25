// Resonance stage: a dark paper arena where music is light and the Hush is ink.
import { W, H, CENTER, GRID, BEINGS, ENEMIES } from './content.js';
import { pitchColor } from './harmony.js';
import { beingStats, tickSeconds, conductorReach } from './sim.js';

const TAU = Math.PI * 2;
const INK = '#0A0908';
const IVORY = '#F4EFE6';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = x => 1 - Math.pow(1 - x, 3);

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = [];
    this.vib = new Map(); // id → { amp, color }
    this.glows = new Map();
    this.coverage = document.createElement('canvas');
    this.grain = this.makeGrain();
    this.clock = 0;
    this.shake = 0;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.scale = Math.min(r.width / W, r.height / H);
    this.ox = (r.width - W * this.scale) / 2;
    this.oy = (r.height - H * this.scale) / 2;
    this.dpr = dpr;
    this.coverage.width = Math.ceil(W * this.scale * dpr);
    this.coverage.height = Math.ceil(H * this.scale * dpr);
  }

  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.scale, y: (clientY - r.top - this.oy) / this.scale };
  }

  makeGrain() {
    const g = document.createElement('canvas'); g.width = g.height = 128;
    const c = g.getContext('2d'), img = c.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 14; }
    c.putImageData(img, 0, 0);
    return g;
  }

  // One sprite per colour at full strength. bloom() applies the moment's alpha, so the cache holds
  // a few dozen entries instead of one per frame.
  glow(color) {
    if (this.glows.has(color)) return this.glows.get(color);
    const s = document.createElement('canvas'); s.width = s.height = 64;
    const c = s.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color); g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)')); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    this.glows.set(color, s);
    return s;
  }

  bloom(c, x, y, radius, color, alpha = 1) {
    const before = c.globalAlpha;
    c.globalAlpha = before * clamp(alpha, 0, 1);
    c.drawImage(this.glow(color), x - radius, y - radius, radius * 2, radius * 2);
    c.globalAlpha = before;
  }

  // Sim events become visual effects at their own beat time (`t`), matching when the sound lands.
  push(e) {
    const add = (kind, extra) => this.fx.push({ ...e, siteKind: e.kind, at: e.t ?? this.clock, life: 0.6, ...extra, kind });
    switch (e.type) {
      case 'play': {
        const color = pitchColor(e.midis[0], 1);
        const v = this.vib.get(e.id) || { amp: 0, color };
        v.amp = Math.min(1, v.amp + (e.combat ? 0.8 : 0.35)); v.color = color; v.at = e.t;
        this.vib.set(e.id, v);
        if (e.hits.length) add('beam', { color, life: 0.28 });
        else add('note', { color, life: 0.9 });
        break;
      }
      case 'wellPay': {
        const color = pitchColor(e.midi, 1);
        this.vib.set(e.id, { amp: 1, color });
        add('mote', { color, life: 1.1 });
        break;
      }
      case 'kill': add('burst', { color: 'hsla(0,0%,96%,1)', life: 0.9 }); break;
      case 'tap': add('ripple', { color: pitchColor(e.midi, 1), life: 0.7 }); break;
      case 'strike': add('strikeRing', { life: 0.45 }); break;
      case 'accent': add('accentRing', { life: 0.6 }); break;
      case 'gust': add('gust', { life: 0.7 }); break;
      case 'found': add('reveal', { life: 1.6 }); break;
      case 'placed': case 'rebuilt': case 'awakened': case 'wellBuilt': case 'developed': case 'wellUp': add('bloomRing', { life: 1 }); break;
      case 'down': add('shatter', { life: 1.2 }); this.shake = Math.max(this.shake, 0.25); break;
      case 'hit': add('hitFlash', { life: 0.25 }); break;
      case 'conductorHit': add('hurt', { life: 0.5 }); this.shake = Math.max(this.shake, 0.35); break;
      case 'bossBreak': add('bloomRing', { life: 1.4, big: true }); break;
      case 'sweep': add('sweepArc', { life: 0.9 }); this.shake = Math.max(this.shake, 0.5); break;
      case 'bossDown': add('bloomRing', { life: 2, big: true }); break;
      default: break;
    }
    if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
  }

  frame(state, view, renderTime, dt) {
    this.clock = renderTime;
    const c = this.ctx, s = this.scale * this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = INK; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.shake = Math.max(0, this.shake - dt);
    const jolt = this.shake * 6;
    c.setTransform(s, 0, 0, s, this.ox * this.dpr + (Math.random() - 0.5) * jolt * this.dpr, this.oy * this.dpr + (Math.random() - 0.5) * jolt * this.dpr);
    for (const v of this.vib.values()) v.amp *= Math.pow(0.02, dt);

    const beatPhase = ((state.tick % GRID) + state.tickPhase / tickSeconds(state)) / GRID;
    const beatPulse = Math.pow(1 - beatPhase, 3);
    const t = performance.now() / 1000;

    this.drawField(c, state, beatPulse);
    this.drawCoverage(c, state, view);
    this.drawSites(c, state, t, view);
    this.drawStrings(c, state, t);
    this.drawWells(c, state, t, view);
    this.drawBeings(c, state, t, view);
    this.drawEnemies(c, state, t);
    this.drawBoss(c, state, t);
    this.drawConductor(c, state, t, beatPulse);
    this.drawEffects(c, state, renderTime);
    this.drawGhost(c, state, view);
  }

  drawField(c, state, beatPulse) {
    const pattern = this.pattern || (this.pattern = c.createPattern(this.grain, 'repeat'));
    c.fillStyle = '#0E0C0B'; c.fillRect(0, 0, W, H);
    c.fillStyle = pattern; c.fillRect(0, 0, W, H);
    const linked = state.beings.filter(b => b.placed && b.hp > 0);
    const share = linked.length ? linked.filter(b => b.linked).length / linked.length : 1;
    const g = c.createRadialGradient(CENTER.x, CENTER.y, 8, CENTER.x, CENTER.y, 300);
    g.addColorStop(0, `rgba(166,191,238,${0.1 + 0.08 * beatPulse * share})`); g.addColorStop(1, 'rgba(166,191,238,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // A thin cut edge frames the arena like a paper stage.
    c.strokeStyle = 'rgba(244,239,230,0.06)'; c.lineWidth = 1; c.strokeRect(2.5, 2.5, W - 5, H - 5);
  }

  drawCoverage(c, state, view) {
    // The union of pulse circles only changes when the network does, so it is painted once per change.
    const key = (state.relays || []).map(r => `${r.x | 0},${r.y | 0},${r.r | 0}`).join(';') + '|' + this.coverage.width;
    if (key !== this.coverageKey) {
      this.coverageKey = key;
      const k = this.coverage.getContext('2d'), s = this.scale * this.dpr;
      k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, this.coverage.width, this.coverage.height);
      k.setTransform(s, 0, 0, s, 0, 0); k.fillStyle = '#a6bfee';
      for (const r of state.relays || []) { k.beginPath(); k.arc(r.x, r.y, r.r, 0, TAU); k.fill(); }
    }
    c.save(); c.setTransform(this.dpr, 0, 0, this.dpr, this.ox * this.dpr, this.oy * this.dpr);
    c.globalAlpha = view.placing ? 0.12 : 0.045;
    c.drawImage(this.coverage, 0, 0, this.coverage.width / this.dpr, this.coverage.height / this.dpr);
    c.restore();
  }

  drawSites(c, state, t, view) {
    for (const site of state.sites) {
      if (site.taken) continue;
      if (!site.discovered) {
        // Undiscovered potential shows as a faint shimmer: a reason to extend the pulse.
        c.globalAlpha = 0.18 + 0.12 * Math.sin(t * 1.3 + site.x);
        c.fillStyle = IVORY; c.beginPath(); c.arc(site.x, site.y, 1.6, 0, TAU); c.fill();
        c.globalAlpha = 0.06; c.beginPath(); c.arc(site.x, site.y, 9, 0, TAU); c.fill();
        c.globalAlpha = 1;
        continue;
      }
      const selected = view.selectedId === site.id;
      c.save(); c.translate(site.x, site.y);
      if (site.kind === 'well') {
        c.rotate(Math.PI / 4 + Math.sin(t * 0.6) * 0.05);
        c.strokeStyle = 'rgba(176,232,219,0.55)'; c.setLineDash([3, 3]); c.lineWidth = 1.2;
        c.strokeRect(-8, -8, 16, 16); c.setLineDash([]);
      } else {
        const color = BEINGS[site.identity].color;
        const breath = 1 + 0.08 * Math.sin(t * 1.1 + site.y);
        c.strokeStyle = color; c.globalAlpha = 0.55; c.lineWidth = 1.2; c.setLineDash([2, 4]);
        c.beginPath(); c.arc(0, 0, 12 * breath, 0, TAU); c.stroke(); c.setLineDash([]);
        c.globalAlpha = 0.18; c.fillStyle = color; c.beginPath(); c.arc(0, 0, 9 * breath, 0, TAU); c.fill();
        c.globalAlpha = 0.7; c.fillStyle = IVORY; c.font = '600 8px ui-monospace, monospace'; c.textAlign = 'center'; c.fillText('z', 9, -9 - Math.sin(t * 2) * 2);
      }
      if (selected) { c.globalAlpha = 1; c.strokeStyle = IVORY; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 17, 0, TAU); c.stroke(); }
      c.restore(); c.globalAlpha = 1;
    }
  }

  relayPos(state, id) {
    if (id === 'conductor') return CENTER;
    return state.beings.find(b => b.id === id) || null;
  }

  string(c, a, b, amp, color, width, t, alpha) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    c.strokeStyle = color; c.globalAlpha = alpha; c.lineWidth = width;
    c.beginPath();
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      // A plucked string: fixed ends, fundamental plus two harmonics, like EmotiTone's strings.
      const wave = Math.sin(Math.PI * u) * (Math.sin(u * Math.PI * 2 + t * 40) + 0.3 * Math.sin(u * Math.PI * 4 - t * 55)) * amp * 5;
      const x = a.x + dx * u + nx * wave, y = a.y + dy * u + ny * wave;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.stroke(); c.globalAlpha = 1;
  }

  drawStrings(c, state, t) {
    for (const b of state.beings) {
      if (!b.placed) continue;
      if (b.hp <= 0) continue;
      if (b.linked && b.parent) {
        const from = this.relayPos(state, b.parent); if (!from) continue;
        const v = this.vib.get(b.id);
        this.string(c, from, b, v ? v.amp : 0, v && v.amp > 0.05 ? v.color : 'rgba(244,239,230,1)', 1.1, t, v ? 0.25 + v.amp * 0.6 : 0.2);
      } else if (!b.linked) {
        // Cut off: a frayed end reaching for a pulse that is no longer there.
        const near = (state.relays || []).slice().sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
        if (!near) continue;
        const ang = Math.atan2(near.y - b.y, near.x - b.x);
        const reach = 18 + Math.sin(t * 7 + b.x) * 4;
        c.strokeStyle = 'rgba(236,157,146,0.55)'; c.lineWidth = 1; c.setLineDash([2, 3]);
        c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x + Math.cos(ang) * reach, b.y + Math.sin(ang) * reach); c.stroke(); c.setLineDash([]);
      }
    }
    for (const w of state.wells) {
      if (w.hp <= 0 || !w.linked || !w.parent) continue;
      const from = this.relayPos(state, w.parent); if (!from) continue;
      const v = this.vib.get(w.id);
      this.string(c, from, w, v ? v.amp * 0.6 : 0, 'rgba(176,232,219,1)', 0.8, t, 0.18 + (v ? v.amp * 0.4 : 0));
    }
  }

  drawWells(c, state, t, view) {
    for (const w of state.wells) {
      const selected = view.selectedId === w.id;
      c.save(); c.translate(w.x, w.y);
      const size = 7 + w.level * 0.9;
      if (w.hp <= 0) {
        c.rotate(Math.PI / 4); c.strokeStyle = 'rgba(244,239,230,0.3)'; c.setLineDash([2, 3]); c.strokeRect(-size, -size, size * 2, size * 2); c.setLineDash([]);
        c.restore(); this.healthBar(c, w, 16); continue;
      }
      const v = this.vib.get(w.id);
      if (v && v.amp > 0.02) this.bloom(c, 0, 0, 22 + v.amp * 18, v.color, 0.5 * v.amp);
      c.rotate(Math.PI / 4 + t * 0.2);
      c.fillStyle = w.linked ? 'rgba(176,232,219,0.25)' : 'rgba(176,232,219,0.08)';
      c.strokeStyle = w.linked ? 'rgba(176,232,219,0.95)' : 'rgba(176,232,219,0.4)'; c.lineWidth = 1.4;
      c.fillRect(-size, -size, size * 2, size * 2); c.strokeRect(-size, -size, size * 2, size * 2);
      c.rotate(-t * 0.4); c.strokeStyle = 'rgba(244,239,230,0.35)'; c.strokeRect(-size * 0.45, -size * 0.45, size * 0.9, size * 0.9);
      c.restore();
      if (selected) { c.strokeStyle = IVORY; c.lineWidth = 1; c.beginPath(); c.arc(w.x, w.y, size + 9, 0, TAU); c.stroke(); }
      this.healthBar(c, w, 16);
    }
  }

  healthBar(c, s, offset) {
    if (s.hp >= s.maxHp) return;
    const width = 24;
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(s.x - width / 2, s.y + offset, width, 2.5);
    c.fillStyle = s.hp > 0 ? '#b0e8db' : '#ec9d92'; c.fillRect(s.x - width / 2, s.y + offset, width * Math.max(0, s.hp / s.maxHp), 2.5);
  }

  blob(c, x, y, r, t, wobble, seed) {
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU;
      const rr = r * (1 + wobble * (0.1 * Math.sin(a * 3 + t * 1.7 + seed) + 0.05 * Math.sin(a * 5 - t * 2.3 + seed) + 0.03 * Math.sin(a * 7 + t * 3.1)));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
  }

  drawBeings(c, state, t, view) {
    for (const b of state.beings) {
      if (!b.placed) continue;
      const def = BEINGS[b.identity];
      const selected = view.selectedId === b.id;
      const r = 9 + (b.identity === 'pulse' || b.identity === 'drone' ? 2 : 0);
      if (b.hp <= 0) {
        c.strokeStyle = 'rgba(244,239,230,0.3)'; c.setLineDash([2, 3]); c.lineWidth = 1;
        this.blob(c, b.x, b.y, r, 0, 0.3, 1); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(244,239,230,0.35)'; c.font = '7px ui-monospace, monospace'; c.textAlign = 'center'; c.fillText('silent', b.x, b.y + r + 10);
        if (selected) { c.strokeStyle = IVORY; c.beginPath(); c.arc(b.x, b.y, r + 9, 0, TAU); c.stroke(); }
        continue;
      }
      const v = this.vib.get(b.id);
      const amp = v ? v.amp : 0;
      const jitterX = b.linked ? 0 : (Math.random() - 0.5) * 1.6, jitterY = b.linked ? 0 : (Math.random() - 0.5) * 1.6;
      const x = b.x + jitterX, y = b.y + jitterY;
      if (selected) {
        const stats = beingStats(state, b);
        c.strokeStyle = def.color; c.globalAlpha = 0.25; c.setLineDash([3, 5]); c.beginPath(); c.arc(b.x, b.y, stats.range, 0, TAU); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      }
      if (amp > 0.03) this.bloom(c, x, y, r * (2.2 + amp * 1.6), v.color, 0.7 * amp);
      const wobble = 1 + amp * 2.2 + (b.linked ? 0 : 1.5);
      const grad = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r * 1.2);
      grad.addColorStop(0, b.linked ? IVORY : '#bdb3a8');
      grad.addColorStop(0.35, def.color);
      grad.addColorStop(1, b.linked ? def.color + '55' : def.color + '22');
      c.fillStyle = grad;
      this.blob(c, x, y, r, t, wobble, b.x); c.fill();
      c.strokeStyle = amp > 0.1 ? v.color : def.color; c.lineWidth = 1; c.stroke();
      // Development is drawn on the being itself: pips for mastery, ticks for subdivision, rings for octaves.
      c.fillStyle = IVORY;
      for (let i = 1; i < b.dev.mastery; i++) { const a = -Math.PI / 2 + (i - (b.dev.mastery) / 2) * 0.42; c.beginPath(); c.arc(b.x + Math.cos(a) * (r + 5), b.y + Math.sin(a) * (r + 5), 1.2, 0, TAU); c.fill(); }
      if (b.dev.subdivision) {
        c.strokeStyle = 'rgba(244,206,158,0.7)'; c.lineWidth = 1;
        const n = 4 * Math.pow(2, b.dev.subdivision);
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU + t * 0.5; c.beginPath(); c.moveTo(b.x + Math.cos(a) * (r + 8), b.y + Math.sin(a) * (r + 8)); c.lineTo(b.x + Math.cos(a) * (r + 10), b.y + Math.sin(a) * (r + 10)); c.stroke(); }
      }
      for (let i = 0; i < b.dev.octave; i++) { c.strokeStyle = 'rgba(166,191,238,0.5)'; c.beginPath(); c.arc(b.x, b.y, r + 13 + i * 3, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); }
      if (b.accents > 0) { c.strokeStyle = IVORY; c.lineWidth = 1.5; c.beginPath(); c.arc(b.x, b.y, r + 4 + Math.sin(t * 9) * 1.5, 0, TAU); c.stroke(); }
      if (selected) { c.strokeStyle = IVORY; c.lineWidth = 1; c.beginPath(); c.arc(b.x, b.y, r + 16, 0, TAU); c.stroke(); }
      this.healthBar(c, b, r + 6);
    }
  }

  drawEnemies(c, state, t) {
    for (const e of state.enemies) {
      const def = ENEMIES[e.type];
      c.save(); c.translate(e.x, e.y);
      const heading = Math.atan2(CENTER.y - e.y, CENTER.x - e.x);
      c.rotate(heading);
      // The Hush is ink: it absorbs light rather than emitting it.
      c.fillStyle = '#030202'; c.strokeStyle = def.color; c.globalAlpha = 0.85; c.lineWidth = 1;
      const r = def.radius;
      c.beginPath();
      if (e.type === 'darter') { c.moveTo(r * 1.6, 0); c.lineTo(-r, r * 0.8); c.lineTo(-r * 0.5, 0); c.lineTo(-r, -r * 0.8); c.closePath(); }
      else if (e.type === 'shell') { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 0.3; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.closePath(); }
      else { for (let i = 0; i <= 14; i++) { const a = (i / 14) * TAU; const rr = r * (1 + 0.15 * Math.sin(a * 4 + t * 3 + e.x)); const px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.closePath(); }
      c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 6; c.fill(); c.shadowBlur = 0; c.stroke();
      c.restore(); c.globalAlpha = 1;
      if (e.slow > 0) { c.strokeStyle = 'rgba(159,214,196,0.5)'; c.beginPath(); c.arc(e.x, e.y, def.radius + 4, 0, TAU); c.stroke(); }
      if (e.hp < e.maxHp) { c.fillStyle = 'rgba(244,239,230,0.12)'; c.fillRect(e.x - 8, e.y - def.radius - 6, 16, 1.8); c.fillStyle = def.color; c.fillRect(e.x - 8, e.y - def.radius - 6, 16 * Math.max(0, e.hp / e.maxHp), 1.8); }
    }
  }

  drawBoss(c, state, t) {
    const boss = state.boss;
    if (!boss) return;
    if (boss.telegraph > 0) {
      const a = 1 - boss.telegraph / 3;
      c.fillStyle = `rgba(236,157,146,${0.05 + a * 0.18})`;
      c.beginPath(); c.moveTo(CENTER.x, CENTER.y); c.arc(CENTER.x, CENTER.y, 420, boss.angle - 0.6, boss.angle + 0.6); c.closePath(); c.fill();
      c.strokeStyle = `rgba(236,157,146,${0.3 + a * 0.5})`; c.lineWidth = 1; c.stroke();
    }
    c.save(); c.translate(boss.x, boss.y);
    for (let i = 0; i < 4; i++) {
      c.rotate(t * 0.15 + i);
      c.fillStyle = '#030202'; c.globalAlpha = 0.9;
      c.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; const rr = (26 - i * 4) * (1 + 0.12 * Math.sin(a * 3 + t * 2 + i)); const px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (k) c.lineTo(px, py); else c.moveTo(px, py); } c.closePath();
      c.fill(); c.strokeStyle = boss.shell ? '#a6bfee' : boss.exposed > 0 ? '#f4ce9e' : '#ec9d92'; c.globalAlpha = 0.6; c.stroke();
    }
    c.restore(); c.globalAlpha = 1;
    if (boss.shell) { c.strokeStyle = 'rgba(166,191,238,0.8)'; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath(); c.arc(boss.x, boss.y, 34 + Math.sin(t * 4) * 2, 0, TAU); c.stroke(); c.setLineDash([]); }
    c.fillStyle = 'rgba(244,239,230,0.12)'; c.fillRect(60, 10, 240, 4);
    c.fillStyle = boss.shell ? '#a6bfee' : '#ec9d92'; c.fillRect(60, 10, 240 * Math.max(0, boss.hp / boss.maxHp), 4);
  }

  drawConductor(c, state, t, beatPulse) {
    const k = state.conductor;
    const ward = k.ward;
    if (ward) { c.fillStyle = 'rgba(176,232,219,0.07)'; c.strokeStyle = 'rgba(176,232,219,0.7)'; c.lineWidth = 1.2; c.beginPath(); c.arc(ward.x, ward.y, ward.r, 0, TAU); c.fill(); c.stroke(); }
    this.bloom(c, CENTER.x, CENTER.y, 44 + beatPulse * 16, 'rgba(166,191,238,1)', 0.35 + 0.35 * beatPulse);
    const grad = c.createRadialGradient(CENTER.x - 4, CENTER.y - 4, 2, CENTER.x, CENTER.y, 18);
    grad.addColorStop(0, IVORY); grad.addColorStop(0.5, '#a6bfee'); grad.addColorStop(1, 'rgba(166,191,238,0.2)');
    c.fillStyle = grad; this.blob(c, CENTER.x, CENTER.y, 14 + beatPulse * 1.5, t, 1 + beatPulse, 0); c.fill();
    // Health outside, breath (power) inside.
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(244,239,230,0.1)'; c.beginPath(); c.arc(CENTER.x, CENTER.y, 22, 0, TAU); c.stroke();
    c.strokeStyle = k.hp / k.maxHp > 0.35 ? '#b0e8db' : '#ec9d92';
    c.beginPath(); c.arc(CENTER.x, CENTER.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * (k.hp / k.maxHp)); c.stroke();
    c.lineWidth = 1.2; c.strokeStyle = 'rgba(244,206,158,0.8)';
    c.beginPath(); c.arc(CENTER.x, CENTER.y, 18.5, -Math.PI / 2, -Math.PI / 2 + TAU * (k.power / 100)); c.stroke();
    if (k.chorus > 0) { c.strokeStyle = 'rgba(244,239,230,0.6)'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(CENTER.x, CENTER.y, 28 + i * 7 + Math.sin(t * 4 + i) * 2, -0.8 + i * 0.2, 0.8 - i * 0.2); c.stroke(); c.beginPath(); c.arc(CENTER.x, CENTER.y, 28 + i * 7 + Math.sin(t * 4 + i) * 2, Math.PI - 0.8 + i * 0.2, Math.PI + 0.8 - i * 0.2); c.stroke(); } }
    c.strokeStyle = 'rgba(166,191,238,0.12)'; c.setLineDash([2, 6]); c.lineWidth = 1; c.beginPath(); c.arc(CENTER.x, CENTER.y, conductorReach(state), 0, TAU); c.stroke(); c.setLineDash([]);
  }

  drawEffects(c, state, now) {
    this.fx = this.fx.filter(f => now - f.at < f.life);
    for (const f of this.fx) {
      const age = now - f.at;
      if (age < 0) continue;
      const p = clamp(age / f.life, 0, 1), a = 1 - p;
      switch (f.kind) {
        case 'beam':
          c.strokeStyle = f.color; c.globalAlpha = a; c.lineWidth = f.accent ? 2.4 : 1.4;
          for (const h of f.hits) { c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(h.x, h.y); c.stroke(); this.bloom(c, h.x, h.y, 10 * a + 4, f.color, 0.8 * a); }
          break;
        case 'note':
          c.globalAlpha = a * (f.linked ? 0.8 : 0.5); c.strokeStyle = f.color; c.lineWidth = 1;
          c.beginPath(); c.arc(f.x, f.y, 10 + p * 14, 0, TAU); c.stroke();
          break;
        case 'mote': {
          const q = ease(p);
          const x = f.x + (CENTER.x - f.x) * q, y = f.y + (CENTER.y - f.y) * q - Math.sin(q * Math.PI) * 14;
          c.globalAlpha = a; this.bloom(c, x, y, 6, f.color, 0.9);
          c.globalAlpha = a * 0.8; c.fillStyle = IVORY; c.font = '600 8px ui-monospace, monospace'; c.textAlign = 'center';
          if (p < 0.5) c.fillText('+' + fmt(f.amount), f.x, f.y - 14 - p * 20);
          break;
        }
        case 'burst':
          for (let i = 0; i < 6; i++) { const ang = (i / 6) * TAU + f.x; const rr = 4 + ease(p) * 16; c.globalAlpha = a; c.fillStyle = pitchColor(50 + i * 3, 1); c.beginPath(); c.arc(f.x + Math.cos(ang) * rr, f.y + Math.sin(ang) * rr, 1.4, 0, TAU); c.fill(); }
          break;
        case 'ripple':
          c.globalAlpha = a; c.strokeStyle = f.color; c.lineWidth = f.onBeat ? 2 : 1;
          c.beginPath(); c.arc(f.x, f.y, 4 + ease(p) * (f.onBeat ? 34 : 22), 0, TAU); c.stroke();
          c.fillStyle = IVORY; c.font = `600 ${f.onBeat ? 11 : 9}px ui-monospace, monospace`; c.textAlign = 'center';
          c.fillText('+' + fmt(f.amount) + (f.onBeat ? ' ♪' : ''), f.x, f.y - 12 - p * 16);
          break;
        case 'strikeRing':
          c.globalAlpha = a; c.strokeStyle = f.onBeat ? '#f4ce9e' : IVORY; c.lineWidth = 2;
          c.beginPath(); c.arc(f.x, f.y, f.radius * (0.4 + ease(p) * 0.8), 0, TAU); c.stroke();
          for (let i = 0; i < 4; i++) { const ang = i * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.moveTo(f.x + Math.cos(ang) * 4, f.y + Math.sin(ang) * 4); c.lineTo(f.x + Math.cos(ang) * (8 + p * 10), f.y + Math.sin(ang) * (8 + p * 10)); c.stroke(); }
          break;
        case 'accentRing':
          c.globalAlpha = a; c.strokeStyle = '#f4ce9e'; c.lineWidth = 1.5;
          for (const id of f.ids) { const b = state.beings.find(x => x.id === id); if (b) { c.beginPath(); c.arc(b.x, b.y, 12 + p * 16, 0, TAU); c.stroke(); } }
          break;
        case 'gust':
          c.globalAlpha = a * 0.9; c.strokeStyle = 'rgba(176,232,219,1)'; c.lineWidth = 6 * f.strength * a + 1; c.lineCap = 'round';
          c.beginPath(); c.moveTo(f.a.x, f.a.y); c.lineTo(f.b.x, f.b.y); c.stroke(); c.lineCap = 'butt';
          break;
        case 'reveal':
          c.globalAlpha = a; c.strokeStyle = f.siteKind === 'well' ? '#b0e8db' : IVORY; c.lineWidth = 1;
          c.beginPath(); c.arc(f.x, f.y, 6 + ease(p) * 30, 0, TAU); c.stroke();
          break;
        case 'bloomRing':
          c.globalAlpha = a; c.strokeStyle = IVORY; c.lineWidth = 1.5;
          c.beginPath(); c.arc(f.x, f.y, 8 + ease(p) * (f.big ? 90 : 26), 0, TAU); c.stroke();
          break;
        case 'shatter':
          c.globalAlpha = a; c.fillStyle = '#ec9d92';
          for (let i = 0; i < 8; i++) { const ang = (i / 8) * TAU; const rr = ease(p) * 22; c.fillRect(f.x + Math.cos(ang) * rr - 1, f.y + Math.sin(ang) * rr - 1, 2, 2); }
          break;
        case 'hitFlash':
          c.globalAlpha = a * 0.7; c.strokeStyle = f.shielded ? '#b0e8db' : '#ec9d92'; c.lineWidth = 1;
          c.beginPath(); c.arc(f.x, f.y, 14, 0, TAU); c.stroke();
          break;
        case 'hurt':
          c.globalAlpha = a * 0.6; c.strokeStyle = '#ec9d92'; c.lineWidth = 3;
          c.beginPath(); c.arc(CENTER.x, CENTER.y, 24 + p * 20, 0, TAU); c.stroke();
          break;
        case 'sweepArc':
          c.globalAlpha = a; c.strokeStyle = '#ec9d92'; c.lineWidth = 4;
          c.beginPath(); c.arc(CENTER.x, CENTER.y, 40 + ease(p) * 260, f.angle - 0.6, f.angle + 0.6); c.stroke();
          break;
        default: break;
      }
      c.globalAlpha = 1;
    }
  }

  drawGhost(c, state, view) {
    const g = view.ghost;
    if (!g) return;
    const def = BEINGS[g.identity];
    c.globalAlpha = 0.8;
    c.strokeStyle = g.reason ? '#ec9d92' : def.color; c.setLineDash([3, 4]); c.lineWidth = 1;
    c.beginPath(); c.arc(g.x, g.y, def.range, 0, TAU); c.stroke();
    c.strokeStyle = g.reason ? '#ec9d92' : 'rgba(166,191,238,0.6)';
    c.beginPath(); c.arc(g.x, g.y, def.relay, 0, TAU); c.stroke(); c.setLineDash([]);
    c.fillStyle = (g.reason ? '#ec9d92' : def.color) + '88';
    c.beginPath(); c.arc(g.x, g.y, 10, 0, TAU); c.fill();
    c.globalAlpha = 1;
  }
}

export function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'b';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'm';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  if (a >= 100) return Math.floor(n).toString();
  return (Math.round(n * 10) / 10).toString();
}
