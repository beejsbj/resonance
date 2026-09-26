import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';

const root = path.resolve('public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const chromeBinary = [process.env.CHROME_BIN, '/opt/google/chrome/chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ...(process.env.PATH || '').split(path.delimiter).flatMap(dir => ['google-chrome', 'chromium', 'chromium-browser'].map(name => path.join(dir, name))),
].find(file => { try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; } });

function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url); this.next = 0; this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
  }
  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = ++this.next;
    const reply = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return reply;
  }
  close() { this.ws.close(); }
}

async function eventually(read, description) {
  for (let i = 0; i < 100; i++) { const value = await read(); if (value) return value; await wait(25); }
  throw new Error('Timed out waiting for ' + description);
}

test('the second tab waits, takes over fresh state, and settles a short absence once', { timeout: 30000, skip: !chromeBinary && 'Set CHROME_BIN to run the browser regression' }, async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'resonance-chrome-'));
  const server = await serve();
  const port = server.address().port;
  const chrome = spawn(chromeBinary, ['--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let cdp;
  try {
    const debugPort = Number((await eventually(async () => {
      try { return (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { return ''; }
    }, 'Chrome debugger')).trim());
    const info = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    cdp = new Cdp(info.webSocketDebuggerUrl);
    const tab = async () => {
      const targetId = (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId;
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send('Page.enable', {}, sessionId); await cdp.send('Runtime.enable', {}, sessionId);
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/play/` }, sessionId);
      return { targetId, sessionId };
    };
    const evaluate = async (tab, expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, tab.sessionId)).result.value;
    const first = await tab();
    await eventually(() => evaluate(first, 'window.__resonance && window.__resonance.ownsGame'), 'first tab ownership');
    const second = await tab();
    await eventually(() => evaluate(second, 'document.querySelector("#begin").disabled && !window.__resonance.state'), 'second tab waiting');
    await evaluate(first, 'window.__resonance.state.resonance = 777; document.querySelector("#panel button").click()');
    const expected = await evaluate(first, 'window.__resonance.state.resonance');
    await evaluate(first, 'window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }))');
    await eventually(() => evaluate(second, 'window.__resonance.ownsGame && window.__resonance.state && window.__resonance.state.resonance'), 'second tab takeover');
    assert.equal(await evaluate(second, 'window.__resonance.state.resonance'), expected, 'waiter loaded the owner\'s latest save');
    await evaluate(first, 'window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))');
    assert.equal(await evaluate(first, '!window.__resonance.ownsGame && !window.__resonance.state && document.querySelector("#begin").disabled'), true, 'a restored page waits without retaining a stale run');
    await cdp.send('Target.closeTarget', { targetId: first.targetId });
    const shortGap = await evaluate(second, `(() => {
      const s = window.__resonance.state, realNow = Date.now; let now = 1000; Date.now = () => now;
      s.phase = 'wave'; s.wells = [{ id: 'short-gap', x: 1, y: 1, level: 1, hp: 40, maxHp: 40, linked: true }];
      const before = s.resonance, danger = JSON.stringify(s.enemies);
      Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
      now = 3000; Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange'));
      const once = s.resonance - before; document.dispatchEvent(new Event('visibilitychange')); Date.now = realNow;
      return { once, expected: window.__resonance.S.incomePerSecond(s) * 2, danger, after: JSON.stringify(s.enemies), paused: s.paused };
    })()`);
    assert.ok(shortGap.once > 0, 'a two-second hidden gap paid income');
    assert.ok(Math.abs(shortGap.once - shortGap.expected) < 1e-9, 'the gap settled exactly once');
    assert.equal(shortGap.after, shortGap.danger, 'danger did not advance');
    assert.equal(shortGap.paused, false, 'short gaps do not trigger pause UX');
    const storageMessage = await evaluate(second, `(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new Error('blocked'); };
      document.querySelector('#panel button').click();
      Storage.prototype.setItem = setItem;
      return document.querySelector('#banner').textContent;
    })()`);
    assert.equal(storageMessage, 'Progress cannot be saved on this device.');
  } finally {
    cdp?.close();
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill(); await exited;
    await new Promise(resolve => server.close(resolve)); await rm(profile, { recursive: true, force: true });
  }
});
