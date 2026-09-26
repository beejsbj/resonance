import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';

const root = path.resolve('public');
const chromeBinary = [process.env.CHROME_BIN, '/opt/google/chrome/chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ...(process.env.PATH || '').split(path.delimiter).flatMap(dir => ['google-chrome', 'chromium', 'chromium-browser'].map(name => path.join(dir, name))),
]
  .find(file => { try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; } });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': path.extname(file) === '.js' ? 'text/javascript' : path.extname(file) === '.css' ? 'text/css' : 'text/html' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url); this.next = 0; this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = e => {
      const message = JSON.parse(e.data), pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    };
  }
  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = ++this.next;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return result;
  }
  close() { this.ws.close(); }
}

async function eventually(read, description) {
  for (let i = 0; i < 100; i++) { const value = await read(); if (value) return value; await wait(25); }
  throw new Error('Timed out waiting for ' + description);
}

test('touch gestures scroll the roster, then select, tap-place, and drag-place beings', { timeout: 30000, skip: !chromeBinary && 'Chrome is required for this browser regression' }, async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'resonance-placement-'));
  const server = await serve();
  const chrome = spawn(chromeBinary, ['--headless=new', '--no-sandbox', '--remote-debugging-port=0', '--window-size=390,844', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let cdp;
  try {
    const debugPort = Number((await eventually(async () => {
      try { return (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { return ''; }
    }, 'Chrome debugger')).trim());
    const info = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    cdp = new Cdp(info.webSocketDebuggerUrl);
    const targetId = (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId;
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId); await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/play/` }, sessionId);
    const evaluate = async expression => {
      const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await eventually(() => evaluate('window.__resonance && window.__resonance.ownsGame'), 'game ownership');
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }, sessionId);
    const begin = await evaluate('(() => { const r = document.querySelector("#begin").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: 1 }; })()');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [begin] }, sessionId);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
    await eventually(() => evaluate('document.querySelector("#curtain").hidden'), 'game start');
    const dimensions = await evaluate(`(() => {
      const state = window.__resonance.state, pulse = state.beings.find(b => !b.placed);
      state.sites = []; // Keep random dormant sites out of the gesture targets.
      for (let i = 0; i < 12; i++) state.beings.push({ ...structuredClone(pulse), id: 'touch-test-' + i });
      document.querySelector('#pause').click();
      const roster = document.querySelector('#roster');
      const chip = [...document.querySelectorAll('.chip')].find(el => {
        const r = el.getBoundingClientRect(); return r.left > 100 && r.right < innerWidth - 100;
      });
      const r = chip.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, overflow: roster.scrollWidth > roster.clientWidth };
    })()`);
    assert.equal(dimensions.overflow, true, 'the test roster overflows');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#roster")).touchAction'), 'pan-x', 'the overflowing roster opts into native horizontal panning');
    await evaluate('window.__touchEvents = []; document.addEventListener("pointerdown", e => window.__touchEvents.push(e.pointerType + ":down:" + e.target.id + e.target.className)); window.addEventListener("pointermove", e => window.__touchEvents.push(e.pointerType + ":move")); window.addEventListener("pointercancel", e => window.__touchEvents.push(e.pointerType + ":cancel"));');
    const point = (x, y) => ({ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, force: 1, id: 1 });
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [point(x, y)] }, sessionId);
    const swipe = async (from, to, steps = 6) => {
      await touch('touchStart', from.x, from.y);
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
        await wait(20);
      }
      await touch('touchEnd');
    };
    await swipe(dimensions, { x: dimensions.x - 90, y: dimensions.y });
    await eventually(() => evaluate('document.querySelector("#roster").scrollLeft > 20'), `native horizontal roster scroll (${await evaluate('JSON.stringify(window.__touchEvents)')})`);
    assert.equal(await evaluate('document.querySelectorAll(".chip.placing").length'), 0, 'a horizontal swipe does not enter placement mode');

    await wait(250);
    const chip = await evaluate(`(() => { const r = [...document.querySelectorAll('.chip')].find(chip => { const b = chip.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await touch('touchStart', chip.x, chip.y); await touch('touchEnd');
    await eventually(() => evaluate('document.querySelectorAll(".chip.placing").length === 1'), 'tap selection');
    const target = await evaluate(`(() => { const r = document.querySelector('#stage').getBoundingClientRect(), s = window.__resonance.stage; return { x: r.left + s.ox + 120 * s.scale, y: r.top + s.oy + 280 * s.scale }; })()`);
    await touch('touchStart', target.x, target.y); await touch('touchEnd');
    await eventually(() => evaluate('window.__resonance.state.beings.filter(b => b.placed).length === 2'), 'tap placement');
    assert.equal(await evaluate('document.querySelectorAll(".chip.placing").length'), 0, 'placement mode clears after a successful drag');

    await evaluate(`(() => {
      for (const being of window.__resonance.state.beings.filter(b => !b.placed)) being.dev.reach = 2;
      window.__resonance.state.motifs.push('longPulse');
      const stage = window.__resonance.stage, drawGhost = stage.drawGhost;
      stage.ghostStats = []; stage.drawGhost = function(...args) { if (args[2].ghost) this.ghostStats.push(args[2].ghost.stats); return drawGhost.apply(this, args); };
    })()`);
    const dragChip = await evaluate(`(() => { const r = [...document.querySelectorAll('.chip')].find(chip => { const b = chip.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const dragTarget = await evaluate(`(() => { const { state, S, stage: s } = window.__resonance; const p = [[240,330],[260,280],[120,340],[120,220]].find(([x,y]) => !S.placementReason(state,x,y)); const r = document.querySelector('#stage').getBoundingClientRect(); return { x: r.left + s.ox + p[0] * s.scale, y: r.top + s.oy + p[1] * s.scale }; })()`);
    await touch('touchStart', dragChip.x, dragChip.y);
    await touch('touchMove', dragChip.x, dragChip.y - 20);
    await wait(250);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', dragChip.x + (dragTarget.x - dragChip.x) * i / 6, dragChip.y - 20 + (dragTarget.y - (dragChip.y - 20)) * i / 6);
      await wait(20);
    }
    await touch('touchEnd');
    await eventually(() => evaluate('window.__resonance.state.beings.filter(b => b.placed).length === 3'), 'vertical touch drag placement');
    assert.equal(await evaluate('window.__resonance.stage.ghostStats.some(s => s.range === 108 && s.relay === 118)'), true, 'ghost uses development and motif-aware ranges');
  } finally {
    cdp?.close();
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill(); await exited;
    await new Promise(resolve => server.close(resolve)); await wait(100); await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
