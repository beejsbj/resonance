import assert from 'node:assert/strict';
import test from 'node:test';
import { plan } from './pre-commit.mjs';

const names = (files) => plan(files, () => true).map((step) => step.name);

test('docs and assets alone skip every check', () => {
  assert.deepEqual(names(['docs/game.md', 'README.md', 'LICENSE']), []);
  assert.deepEqual(names(['public/play/icon.png']), []);
});

test('staged code runs lint, format on the staged files, and the suite', () => {
  assert.deepEqual(names(['public/play/src/sim.js']), [
    'lint',
    'format',
    'tests',
  ]);
});

test('format is passed only the staged files that still exist', () => {
  const [, format] = plan(
    ['a.js', 'gone.js', 'notes.md'],
    (p) => p !== 'gone.js',
  );
  assert.deepEqual(format.args.slice(-1), ['a.js']);
  assert.equal(format.args.includes('gone.js'), false);
});

test('a deleted code file still triggers lint and tests', () => {
  assert.deepEqual(
    plan(['lib/old.ts'], () => false).map((s) => s.name),
    ['lint', 'tests'],
  );
});
