/* ResonanceAudio: a dependency-free musical Web Audio engine for the prototype. */
(function () {
  "use strict";

  const MODES = {
    pentatonic: [0, 2, 4, 7, 9],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11]
  };
  const VOICES = ["bloom", "string", "bell", "pulse", "pad"];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

  class ResonanceAudio {
    constructor(onNote) {
      this.onNote = typeof onNote === "function" ? onNote : function () {};
      this.config = {
        bpm: 78, root: 48, mode: "pentatonic", density: 0.48,
        volume: 0.72, muted: false, playing: false,
        levels: { bloom: 0.8, string: 0.68, bell: 0.5, pulse: 0.34, pad: 0.42 }
      };
      this.ctx = null;
      this.master = null;
      this.compressor = null;
      this.delay = null;
      this.delayFeedback = null;
      this.reverb = null;
      this.active = new Set();
      this.holds = new Map();
      this.timer = null;
      this.nextStepTime = 0;
      this.step = 0;
      this.destroyed = false;
      this.maxVoices = 28;
      this._visibility = this._visibility.bind(this);
      document.addEventListener("visibilitychange", this._visibility);
    }

    async start() {
      if (this.destroyed) throw new Error("ResonanceAudio has been destroyed");
      if (!this.ctx) this._buildGraph();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this._syncClock();
    }

    _buildGraph() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio is not supported in this browser");
      const c = this.ctx = new AC();
      this.master = c.createGain();
      this.compressor = c.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 16;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.012;
      this.compressor.release.value = 0.25;
      this.master.connect(this.compressor).connect(c.destination);

      // Two bounded ambience sends: a short filtered feedback delay and generated reverb.
      this.delay = c.createDelay(1);
      this.delay.delayTime.value = 0.29;
      this.delayFeedback = c.createGain();
      this.delayFeedback.gain.value = 0.19;
      const delayFilter = c.createBiquadFilter();
      delayFilter.type = "lowpass";
      delayFilter.frequency.value = 2800;
      this.delay.connect(delayFilter).connect(this.delayFeedback).connect(this.delay);
      delayFilter.connect(this.master);
      this.reverb = c.createConvolver();
      this.reverb.buffer = this._impulse(1.7, 2.8);
      const reverbGain = c.createGain();
      reverbGain.gain.value = 0.22;
      this.reverb.connect(reverbGain).connect(this.master);
      this._applyMaster();
    }

    _impulse(seconds, decay) {
      const length = Math.floor(this.ctx.sampleRate * seconds);
      const b = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
      return b;
    }

    setConfig(next) {
      if (!next || typeof next !== "object") return;
      if (next.bpm != null) this.config.bpm = clamp(next.bpm, 35, 220);
      if (next.root != null) this.config.root = Math.round(clamp(next.root, 24, 84));
      if (MODES[next.mode]) this.config.mode = next.mode;
      if (next.density != null) this.config.density = clamp(next.density, 0, 1);
      if (next.volume != null) this.config.volume = clamp(next.volume, 0, 1);
      if (next.muted != null) this.config.muted = !!next.muted;
      if (next.playing != null) this.config.playing = !!next.playing;
      if (next.levels) VOICES.forEach(v => {
        // Levels may be fractional mix values or economy levels (1..25). Keep the
        // progression for variation while all actual gain remains normalized below.
        if (next.levels[v] != null) this.config.levels[v] = clamp(next.levels[v], 0, 25);
      });
      this._applyMaster();
      this._syncClock();
    }

    _applyMaster() {
      if (!this.master || !this.ctx) return;
      const target = this.config.muted ? 0 : this.config.volume;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.025);
    }

    _syncClock() {
      const shouldRun = this.ctx && this.config.playing && !document.hidden && !this.destroyed;
      if (shouldRun && !this.timer) {
        this.nextStepTime = this.ctx.currentTime + 0.06;
        this.timer = setInterval(() => this._schedule(), 25);
      } else if (!shouldRun && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    _visibility() {
      // Hidden tabs schedule nothing; on return the phrase resumes from its next step.
      this._syncClock();
    }

    _schedule() {
      if (!this.ctx || !this.config.playing) return;
      const sixteenth = 60 / this.config.bpm / 4;
      while (this.nextStepTime < this.ctx.currentTime + 0.12) {
        this._phraseStep(this.step++, this.nextStepTime);
        this.nextStepTime += sixteenth;
      }
    }

    _phraseStep(step, time) {
      const barStep = step % 16;
      const bar = Math.floor(step / 16);
      const d = this.config.density;
      // Stable rhythmic anchors plus probability yield space; slower voices enter across bars.
      if (barStep % 4 === 0 && Math.random() < 0.22 + d * 0.56) this._auto("pulse", barStep === 0 ? 0 : -5, 0.34 + d * 0.22, 0.28, time);
      if ((barStep === 0 || barStep === 8) && Math.random() < 0.18 + d * 0.52) this._auto("bloom", [0, 2, 4, 1][bar % 4], 0.38 + d * 0.25, 1.25, time);
      if ([2, 6, 10, 14].includes(barStep) && Math.random() < d * 0.58) this._auto("string", [4, 2, 5, 1, 3][(step + bar) % 5] + (bar % 2 ? 7 : 0), 0.3 + d * 0.25, 0.62, time);
      if ((barStep === 5 || barStep === 13) && Math.random() < d * 0.36) this._auto("bell", [7, 9, 11, 6][bar % 4], 0.26 + d * 0.2, 1.7, time);
      if (barStep === 0 && bar % 2 === 0 && Math.random() < 0.14 + d * 0.36) this._auto("pad", [0, 3, 4, 1][(bar / 2) % 4], 0.22 + d * 0.18, 5.5, time);
    }

    _auto(voice, degree, velocity, duration, time) {
      if (this.config.levels[voice] <= 0) return;
      this._sound(voice, degree, velocity, duration, time, true);
    }

    _levelGain(voice) {
      const level = this.config.levels[voice];
      if (level <= 1) return level;
      // Economy progression adds headroom gently: level 25 is only 12% louder.
      return 1 + Math.log2(level) / Math.log2(25) * 0.12;
    }

    _levelVariety(voice) {
      const level = this.config.levels[voice];
      return level > 1 ? Math.log2(level) / Math.log2(25) : 0;
    }

    play(voice, degree, velocity = 0.6, duration = 0.7) {
      if (!this.ctx || this.destroyed || !VOICES.includes(voice)) return false;
      return this._sound(voice, degree, velocity, duration, this.ctx.currentTime + 0.005, false);
    }

    _frequency(degree) {
      const scale = MODES[this.config.mode];
      const oct = Math.floor(degree / scale.length);
      const index = ((degree % scale.length) + scale.length) % scale.length;
      const midi = this.config.root + scale[index] + oct * 12;
      return 440 * Math.pow(2, (midi - 69) / 12);
    }

    _sound(voice, degree, velocity, duration, time, automatic) {
      if (this.active.size >= this.maxVoices) return false;
      // Economy levels gate idle generation only. Direct UI gestures always sound;
      // this lets the initial level-zero bloom respond on the unlocking gesture.
      velocity = clamp(velocity, 0.01, 1) * (automatic ? this._levelGain(voice) : 1);
      if (velocity <= 0) return false;
      duration = clamp(duration, 0.06, 8);
      const f = this._frequency(Number(degree) || 0);
      const variety = this._levelVariety(voice);
      const c = this.ctx;
      const out = c.createGain();
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      if (pan) { pan.pan.value = (Math.random() - 0.5) * 0.5; out.connect(pan); pan.connect(this.master); }
      else out.connect(this.master);
      out.connect(this.reverb);
      if (voice !== "pulse") out.connect(this.delay);
      const nodes = [];
      const stopAt = time + duration + 2.1;
      const osc = (type, freq, gain, detune = 0) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, time); o.detune.value = detune;
        g.gain.value = gain; o.connect(g).connect(out); o.start(time); o.stop(stopAt); nodes.push(o); return { o, g };
      };
      if (voice === "bloom") {
        out.gain.setValueAtTime(0.0001, time); out.gain.exponentialRampToValueAtTime(velocity * 0.34, time + 0.12); out.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc("sine", f, 1); osc("triangle", f * 2, 0.13 + variety * 0.025, -5 - variety * 3);
      } else if (voice === "string") {
        out.gain.setValueAtTime(Math.max(0.0001, velocity * 0.33), time); out.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        const filter = c.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.setValueAtTime(Math.min(7600, f * (12 + variety * 3)), time); filter.frequency.exponentialRampToValueAtTime(Math.max(500, f * 2), time + duration);
        const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(filter).connect(out); o.start(time); o.stop(stopAt); nodes.push(o);
      } else if (voice === "bell") {
        out.gain.value = 1;
        [1, 2.01, 3.96, 6.17].forEach((p, i) => { const partial = [0.25, 0.12, 0.07, 0.035][i] * (1 + variety * i * 0.045); const x = osc("sine", f * p, velocity * partial); x.g.gain.setValueAtTime(velocity * partial, time); x.g.gain.exponentialRampToValueAtTime(0.0001, time + duration * (1 - i * 0.1)); });
      } else if (voice === "pulse") {
        out.gain.setValueAtTime(velocity * 0.42, time); out.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        const x = osc("sine", Math.max(45, f / 4), 1); x.o.frequency.exponentialRampToValueAtTime(Math.max(32, f / 8), time + duration * 0.7);
      } else {
        out.gain.setValueAtTime(0.0001, time); out.gain.exponentialRampToValueAtTime(velocity * 0.2, time + 0.65); out.gain.setValueAtTime(velocity * 0.18, time + Math.max(0.7, duration - 1)); out.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc("sine", f / 2, 0.65, -7 - variety * 3); osc("triangle", f, 0.35, 7 + variety * 3); osc("sine", f * 1.5, 0.08 + variety * 0.015, 0);
      }
      this._track(nodes, out, stopAt);
      this.onNote({ voice, degree: Number(degree) || 0, velocity, automatic: !!automatic });
      return true;
    }

    _track(nodes, out, stopAt) {
      const token = { nodes, out };
      this.active.add(token);
      const ms = Math.max(0, (stopAt - this.ctx.currentTime) * 1000 + 50);
      token.timer = setTimeout(() => { this.active.delete(token); try { out.disconnect(); } catch (_) {} }, ms);
    }

    hold(id, voice, degree) {
      if (!this.ctx || this.destroyed || this.holds.has(id) || !VOICES.includes(voice) || this.active.size >= this.maxVoices) return false;
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(), filter = c.createBiquadFilter();
      o.type = voice === "string" ? "sawtooth" : voice === "bell" ? "sine" : "triangle";
      o.frequency.value = this._frequency(Number(degree) || 0);
      filter.type = "lowpass"; filter.frequency.value = voice === "pad" ? 1300 : 3200;
      g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.035);
      o.connect(filter).connect(g).connect(this.master); g.connect(this.reverb); o.start();
      const token = { id, voice, degree, o, g, filter, nodes: [o], out: g };
      this.holds.set(id, token); this.active.add(token);
      this.onNote({ voice, degree: Number(degree) || 0, velocity: 0.7, automatic: false });
      return true;
    }

    moveHold(id, degree, intensity) {
      const h = this.holds.get(id); if (!h || !this.ctx) return;
      h.degree = Number(degree) || 0;
      h.o.frequency.setTargetAtTime(this._frequency(h.degree), this.ctx.currentTime, 0.025);
      h.g.gain.setTargetAtTime(Math.max(0.0001, clamp(intensity, 0, 1) * 0.26), this.ctx.currentTime, 0.03);
    }

    release(id) {
      const h = this.holds.get(id); if (!h || !this.ctx) return;
      this.holds.delete(id);
      const now = this.ctx.currentTime;
      h.g.gain.cancelScheduledValues(now); h.g.gain.setTargetAtTime(0.0001, now, 0.07);
      try { h.o.stop(now + 0.45); } catch (_) {}
      setTimeout(() => { this.active.delete(h); try { h.out.disconnect(); } catch (_) {} }, 520);
    }

    getDiagnostics() {
      return { contextState: this.ctx ? this.ctx.state : "uninitialized", activeVoiceCount: this.active.size };
    }

    async destroy() {
      if (this.destroyed) return;
      this.destroyed = true; this.config.playing = false; this._syncClock();
      document.removeEventListener("visibilitychange", this._visibility);
      Array.from(this.holds.keys()).forEach(id => this.release(id));
      this.active.forEach(t => { clearTimeout(t.timer); (t.nodes || []).forEach(n => { try { n.stop(); } catch (_) {} }); try { t.out.disconnect(); } catch (_) {} });
      this.active.clear(); this.holds.clear();
      if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
    }
  }

  window.ResonanceAudio = ResonanceAudio;
})();
