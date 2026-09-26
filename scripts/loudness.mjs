// Loudness harness: plays the real game in headless Chromium at several points of a run and meters
// what reaches the speaker (after the limiter) and the master bus. Waves are played with taps.
// Usage: node scripts/loudness.mjs [seconds per scenario] [scenario...]
// Needs Playwright with Chromium (a global install is found through `npm root -g`).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as S from '../public/play/src/sim.js';
import { manage } from './bots.mjs';

const seconds = Number(process.argv[2] || 12);
const only = process.argv.slice(3);
const WANTED = ['firstInterlude', 'firstWave', 'wave10Interlude', 'wave24Interlude', 'crisis25', 'wave26'];
const requested = only.length ? only : WANTED;
const unknown = requested.filter(name => !WANTED.includes(name));
if (unknown.length) throw new Error('Unknown loudness scenario(s): ' + unknown.join(', '));
const snap = s => JSON.parse(JSON.stringify(s, (k, v) => (k === 'relays' ? undefined : v)));

// ---------- fixtures: saved runs at the moments worth hearing ----------

function fixtures(wanted) {
  const out = {};
  if (wanted.includes('firstInterlude')) out.firstInterlude = snap(S.newRun(S.newMeta(), 1000));
  if (wanted.includes('firstWave')) {
    const first = S.newRun(S.newMeta(), 1000);
    first.interlude = 0.05; // the smallest orchestra that ever fights: the starting Thread alone
    while (!(first.phase === 'wave' && first.enemies.length >= 4)) S.step(first, 1 / 30);
    out.firstWave = snap(first);
  }
  const later = wanted.some(name => !['firstInterlude', 'firstWave'].includes(name));
  if (!later) return out;
  const state = S.newRun(S.newMeta(), 1000);
  let t = 0, nextManage = 0, last = state.phase;
  while (state.phase !== 'defeated' && t < 3600 && wanted.some(name => !out[name])) {
    S.step(state, 1 / 30); t += 1 / 30;
    if (t >= nextManage) { manage(state); nextManage = t + 2; }
    if (last === 'wave' && state.phase === 'interlude') {
      if (state.wave === 10) { manage(state); out.wave10Interlude = snap(state); }
      if (state.wave === 24) { manage(state); out.wave24Interlude = snap(state); }
    }
    if (state.phase === 'wave' && state.wave === 25 && !out.crisis25 && state.boss && state.enemies.length > 6) out.crisis25 = snap(state);
    if (state.phase === 'wave' && state.wave === 26 && !out.wave26 && state.enemies.length >= 10) out.wave26 = snap(state);
    last = state.phase;
  }
  return out;
}

// ---------- a static server for public/ ----------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve(root) {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function playwright() {
  const specs = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
  try { specs.push(pathToFileURL(path.join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')).href); } catch { /* no global npm */ }
  for (const spec of specs.filter(Boolean)) { try { return await import(spec); } catch { /* try the next */ } }
  throw new Error('The loudness harness needs Playwright: npm i -g playwright, or set PLAYWRIGHT_MODULE to its index.mjs.');
}

// ---------- metering in the page ----------

function installMeter(run) {
  localStorage.setItem('resonance-run-v1', JSON.stringify({ savedAt: Date.now(), state: run }));
  localStorage.setItem('resonance-meta-v1', JSON.stringify({ version: 1, echoes: 0, levels: {}, bestWave: 0, runs: 1, known: ['thread', 'pulse'], tutorial: 99 }));
  window.__meter = (node, key) => {
    const c = node.context, sp = c.createScriptProcessor(4096, 2, 2), sink = c.createGain();
    sink.gain.value = 0;
    const m = window[key] = { peak: 0, sum: 0, n: 0, over: 0, windows: [], acc: 0, accN: 0 };
    sp.onaudioprocess = ev => {
      for (let ch = 0; ch < 2; ch++) {
        const d = ev.inputBuffer.getChannelData(ch);
        for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m.peak) m.peak = a; if (a >= 0.999) m.over++; m.sum += a * a; m.acc += a * a; }
        m.n += d.length; m.accN += d.length;
      }
      if (m.accN >= c.sampleRate * 0.8) { m.windows.push(Math.sqrt(m.acc / m.accN)); m.acc = 0; m.accN = 0; } // 400 ms, both channels
    };
    node.connect(sp).connect(sink).connect(c.destination);
  };
}

const db = x => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf').padStart(6);
const summary = m => { const w = m.windows.slice().sort((a, b) => a - b); return { peak: m.peak, rms: Math.sqrt(m.sum / Math.max(1, m.n)), p50: w[Math.floor(w.length / 2)] || 0, p90: w[Math.floor(w.length * 0.9)] || 0, over: m.over }; };

const runs = fixtures(requested);
const missing = requested.filter(k => !runs[k]);
if (missing.length) throw new Error('The bot run did not reach required fixtures: ' + missing.join(', ') + '.');
const { chromium } = await playwright();
let clipped = false;
const failures = [];
let server, browser;
try {
  server = await serve(path.resolve('public'));
  const url = `http://127.0.0.1:${server.address().port}/play/`;
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  console.log(`dBFS over ${seconds}s each; rms p50/p90 are 400 ms windows.`);
  console.log('scenario          where          voices | speaker  rms   p50   p90  peak clip | master   rms  peak');
  for (const name of requested) {
    const run = runs[name];
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    try {
      const page = await context.newPage();
      page.on('pageerror', e => { pageErrors.push(e.message); console.log('  page error:', e.message); });
      await page.addInitScript(installMeter, run);
      await page.goto(url);
      await page.click('#begin');
      await page.waitForTimeout(600);
      const ready = await page.evaluate(() => { const { sound } = window.__resonance; if (!sound.running) return false; window.__meter(sound.speaker, '__speaker'); window.__meter(sound.master, '__master'); return true; });
      const problems = [];
      if (!ready) problems.push('audio did not start');
      else {
        const box = await page.locator('#stage').boundingBox();
        const until = Date.now() + seconds * 1000;
        while (Date.now() < until) {
          // Play like a person in a wave: strike the threat nearest the conductor about three times a second.
          const target = await page.evaluate(() => {
            const { state: s, stage } = window.__resonance;
            if (s.phase !== 'wave') return null;
            const e = s.boss || s.enemies.slice().sort((a, b) => Math.hypot(a.x - 180, a.y - 280) - Math.hypot(b.x - 180, b.y - 280))[0];
            return e && { x: e.x * stage.scale + stage.ox, y: e.y * stage.scale + stage.oy };
          });
          if (target) await page.mouse.click(box.x + target.x, box.y + target.y);
          await page.waitForTimeout(350);
        }
        const r = await page.evaluate(() => ({ speaker: window.__speaker, master: window.__master, voices: window.__resonance.sound.active, phase: window.__resonance.state.phase, wave: window.__resonance.state.wave }));
        const sp = summary(r.speaker), ms = summary(r.master);
        if (!r.speaker.n) problems.push('speaker meter received no samples');
        if (!r.master.n) problems.push('master meter received no samples');
        clipped ||= sp.over > 0;
        console.log(`${name.padEnd(17)} ${(r.phase + ' w' + r.wave).padEnd(14)} ${String(r.voices).padStart(6)} | ${db(sp.rms)}${db(sp.p50)}${db(sp.p90)}${db(sp.peak)} ${String(sp.over).padStart(4)} | ${db(ms.rms)}${db(ms.peak)}`);
      }
      if (pageErrors.length) problems.push('page error: ' + pageErrors.join('; '));
      if (problems.length) { failures.push(`${name}: ${problems.join('; ')}`); console.error(`${name} failed: ${problems.join('; ')}`); }
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      console.error(`${name} failed: ${error.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve) ?? resolve());
}
if (clipped) { console.log('The speaker clipped.'); failures.push('speaker clipped'); }
if (failures.length) { console.error('Loudness failed: ' + failures.join(' | ')); process.exitCode = 1; }
