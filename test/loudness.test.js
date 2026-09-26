import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve();

const fakePlaywright = `
import { appendFileSync } from 'node:fs';
const mode = process.env.LOUDNESS_FAKE_MODE;
const mark = value => appendFileSync(process.env.LOUDNESS_FAKE_LOG, value + '\\n');
const meter = samples => ({ peak: 0, sum: 0, n: samples, over: 0, windows: [] });
const page = () => ({
  on(event, listener) { if (event === 'pageerror' && mode === 'page-error') listener(new Error('injected page error')); },
  addInitScript: async () => {}, goto: async () => {}, click: async () => {}, waitForTimeout: async () => {},
  evaluate: async fn => {
    const source = String(fn);
    if (source.includes('sound.running')) return mode !== 'audio-startup';
    if (source.includes('speaker: window.__speaker')) return {
      speaker: meter(mode === 'no-speaker-samples' ? 0 : 2),
      master: meter(mode === 'no-master-samples' ? 0 : 2), voices: 1, phase: 'interlude', wave: 0,
    };
    throw new Error('unexpected evaluation: ' + source);
  },
  locator: () => ({ boundingBox: async () => ({ x: 0, y: 0 }) }), mouse: { click: async () => {} },
});
export const chromium = { launch: async () => ({
  newContext: async () => ({ newPage: async () => page(), close: async () => mark('context') }),
  close: async () => mark('browser'),
}) };
`;

async function runLoudness(mode) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'resonance-loudness-'));
  const modulePath = path.join(directory, 'playwright.mjs');
  const log = path.join(directory, 'cleanup.log');
  await writeFile(modulePath, fakePlaywright);
  try {
    const child = await new Promise((resolve, reject) => {
      const childProcess = spawn(process.execPath, ['scripts/loudness.mjs', '0', 'firstInterlude'], {
        cwd: root,
        env: { ...process.env, PLAYWRIGHT_MODULE: modulePath, LOUDNESS_FAKE_MODE: mode, LOUDNESS_FAKE_LOG: log },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      childProcess.stdout.on('data', data => { output += data; });
      childProcess.stderr.on('data', data => { output += data; });
      childProcess.on('error', reject);
      childProcess.on('close', code => resolve({ code, output }));
    });
    return { ...child, cleanup: await readFile(log, 'utf8') };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('loudness rejects an explicitly requested unknown scenario', { timeout: 10000 }, async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/loudness.mjs', '0', 'not-a-scenario'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, output }));
  });
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /Unknown loudness scenario\(s\): not-a-scenario/);
});

for (const [mode, diagnostic] of [
  ['audio-startup', 'audio did not start'],
  ['no-speaker-samples', 'speaker meter received no samples'],
  ['no-master-samples', 'master meter received no samples'],
  ['page-error', 'page error: injected page error'],
]) {
  test(`loudness fails a requested scenario with ${mode}`, { timeout: 10000 }, async () => {
    const result = await runLoudness(mode);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, new RegExp(diagnostic));
    assert.equal(result.cleanup, 'context\nbrowser\n', 'failure still closes the page context and browser');
  });
}
