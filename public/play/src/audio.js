// Resonance sound: each identity is a synthesized voice; notes are scheduled at exact beat times.
import { midiToHz, chordMidis } from './harmony.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.active = 0;
    this.limit = 72;
  }

  async start() {
    if (!this.ctx) this.build();
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  get now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }
  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const c = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.008; comp.release.value = 0.22;
    this.master.connect(comp).connect(c.destination);
    // Ambience sends: a dotted-eighth delay and a generated hall. Density is the aesthetic; the compressor keeps it safe.
    this.delay = c.createDelay(2);
    const fb = c.createGain(); fb.gain.value = 0.28;
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600;
    this.delay.connect(tone).connect(fb).connect(this.delay);
    const delayOut = c.createGain(); delayOut.gain.value = 0.35;
    tone.connect(delayOut).connect(this.master);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 3);
    const verbOut = c.createGain(); verbOut.gain.value = 0.32;
    this.reverb.connect(verbOut).connect(this.master);
    this.noise = this.makeNoise();
  }

  setTempo(bpm) { if (this.delay) this.delay.delayTime.setTargetAtTime((60 / bpm) * 0.75, this.ctx.currentTime, 0.1); }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }

  impulse(seconds, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * seconds), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }

  makeNoise() {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // Output chain for one note: gain envelope → pan → dry + sends. Returns the envelope gain.
  out(time, stop, pan = 0, send = 0.4, echo = 0.25) {
    const c = this.ctx, g = c.createGain(), p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.master);
    if (send) { const s = c.createGain(); s.gain.value = send; p.connect(s).connect(this.reverb); }
    if (echo) { const s = c.createGain(); s.gain.value = echo; p.connect(s).connect(this.delay); }
    this.active++;
    setTimeout(() => { this.active--; try { g.disconnect(); p.disconnect(); } catch { /* already gone */ } }, Math.max(0, (stop - c.currentTime) * 1000 + 80));
    return g;
  }

  osc(type, hz, time, stop, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(hz, time); o.detune.value = detune;
    o.connect(dest); o.start(time); o.stop(stop);
    return o;
  }

  // voice: identity or 'well' | 'tap' | 'kill' | 'hush' | 'chord'. opts: velocity, pan, detune, duration
  play(voice, midi, when, opts = {}) {
    if (!this.running || this.muted) return;
    const quiet = (opts.velocity ?? 0.6) < 0.3;
    if (this.active > this.limit || (quiet && this.active > this.limit * 0.7)) return;
    const c = this.ctx;
    const t = Math.max(c.currentTime + 0.002, when ?? c.currentTime);
    const v = Math.max(0.01, Math.min(1, opts.velocity ?? 0.6));
    const hz = midiToHz(midi);
    const pan = opts.pan ?? 0, detune = opts.detune ?? 0;
    const env = (g, attack, peak, release) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release); };

    if (voice === 'thread') {
      const len = opts.duration ?? 0.5, stop = t + len + 0.1;
      const g = this.out(t, stop, pan, 0.35, 0.3); env(g, 0.012, 0.22 * v, len);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(hz * 9, t); f.frequency.exponentialRampToValueAtTime(hz * 1.8, t + len);
      f.connect(g);
      const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.5; vg.gain.value = 6; vib.connect(vg);
      const o = this.osc('sawtooth', hz, t, stop, f, detune); vg.connect(o.detune); vib.start(t); vib.stop(stop);
      this.osc('triangle', hz * 2, t, stop, f, detune + 4);
    } else if (voice === 'pulse') {
      const stop = t + 0.5;
      const g = this.out(t, stop, pan, 0.12, 0); env(g, 0.004, 0.75 * v, 0.34);
      const o = this.osc('sine', hz * 2, t, stop, g, detune);
      o.frequency.setValueAtTime(hz * 4, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, hz), t + 0.12);
      const n = c.createBufferSource(), ng = c.createGain(), hp = c.createBiquadFilter();
      n.buffer = this.noise; hp.type = 'bandpass'; hp.frequency.value = 1800; ng.gain.setValueAtTime(0.18 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      n.connect(hp).connect(ng).connect(g); n.start(t); n.stop(t + 0.06);
    } else if (voice === 'bell') {
      const len = opts.duration ?? 2.2, stop = t + len + 0.1;
      const g = this.out(t, stop, pan, 0.5, 0.35); g.gain.value = 1;
      [[1, 0.2], [2.76, 0.09], [5.4, 0.05], [8.93, 0.025]].forEach(([ratio, amp], i) => {
        const pg = c.createGain(); pg.connect(g);
        pg.gain.setValueAtTime(0.0001, t); pg.gain.exponentialRampToValueAtTime(amp * v, t + 0.004); pg.gain.exponentialRampToValueAtTime(0.0001, t + len * (1 - i * 0.2));
        this.osc('sine', hz * ratio, t, stop, pg, detune);
      });
    } else if (voice === 'drone') {
      const len = opts.duration ?? 3, stop = t + len + 0.2;
      const g = this.out(t, stop, pan, 0.6, 0.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1 * v, t + len * 0.3); g.gain.setValueAtTime(0.1 * v, t + len * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(g);
      this.osc('triangle', hz, t, stop, f, detune - 7); this.osc('triangle', hz, t, stop, f, detune + 7); this.osc('sine', hz / 2, t, stop, f, detune);
      this.osc('sine', hz * 1.5, t, stop, f, detune);
    } else if (voice === 'spark') {
      const stop = t + 0.35;
      const g = this.out(t, stop, pan, 0.3, 0.45); env(g, 0.003, 0.12 * v, 0.22);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(hz * 12, t); f.frequency.exponentialRampToValueAtTime(hz * 2, t + 0.2); f.connect(g);
      this.osc('square', hz, t, stop, f, detune); this.osc('triangle', hz * 2, t, stop, f, detune);
    } else if (voice === 'well') {
      const stop = t + 1.6;
      const g = this.out(t, stop, pan, 0.55, 0.4); env(g, 0.01, 0.1 * v, 1.4);
      this.osc('sine', hz, t, stop, g, detune); this.osc('sine', hz * 3.01, t, stop, g, detune);
    } else if (voice === 'tap') {
      const len = opts.duration ?? 0.4, stop = t + len + 0.1;
      const g = this.out(t, stop, pan, 0.4, 0.3); env(g, 0.02, 0.2 * v, len);
      const src = c.createOscillator(); src.type = 'sawtooth'; src.frequency.value = hz;
      [[700, 0.8], [1150, 0.5], [2600, 0.2]].forEach(([freq, amp]) => { const bp = c.createBiquadFilter(), bg = c.createGain(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 8; bg.gain.value = amp; src.connect(bp).connect(bg).connect(g); });
      src.start(t); src.stop(stop);
      this.osc('sine', hz, t, stop, g);
    } else if (voice === 'kill') {
      const stop = t + 0.3;
      const g = this.out(t, stop, pan, 0.25, 0.2); env(g, 0.002, 0.06 * v, 0.2);
      this.osc('sine', hz, t, stop, g); this.osc('sine', hz * 1.5, t, stop, g);
    } else if (voice === 'hush') {
      const len = opts.duration ?? 1.2, stop = t + len + 0.1;
      const g = this.out(t, stop, pan, 0.6, 0); env(g, len * 0.4, 0.3 * v, len * 0.6);
      const n = c.createBufferSource(), f = c.createBiquadFilter(); n.buffer = this.noise; n.loop = true;
      f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(1200, t + len * 0.5); f.frequency.exponentialRampToValueAtTime(120, t + len);
      n.connect(f).connect(g); n.start(t); n.stop(stop);
      this.osc('sine', hz, t, stop, g);
    }
  }

  // The conductor's pulse as a sustained chord on each bar; its level follows how much of the orchestra is linked.
  chord(bar, when, level) {
    if (!this.running || this.muted || level <= 0.01) return;
    const c = this.ctx, t = Math.max(c.currentTime, when);
    const stop = t + 6; // a long tail cross-fades into the next bar
    const g = this.out(t, stop, 0, 0.8, 0);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * level, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, stop);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700 + 600 * level; f.connect(g);
    for (const m of chordMidis(bar, 0)) { this.osc('sawtooth', midiToHz(m), t, stop, f, -6); this.osc('sawtooth', midiToHz(m), t, stop, f, 6); }
  }
}
