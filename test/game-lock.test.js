import test from 'node:test';
import assert from 'node:assert/strict';
import { claimGameLock } from '../public/play/src/game-lock.js';

function locks() {
  let held = false;
  const queue = [];
  const next = () => {
    if (held || !queue.length) return;
    held = true;
    const { callback, resolve, reject } = queue.shift();
    void Promise.resolve(callback()).then(resolve, reject).finally(() => { held = false; next(); });
  };
  return { request(_name, _options, callback) { return new Promise((resolve, reject) => { queue.push({ callback, resolve, reject }); next(); }); } };
}

test('only one tab owns the game lock, and a waiter takes over after release', async () => {
  const nativeLocks = locks();
  const events = [];
  const first = claimGameLock({ locks: nativeLocks, onWaiting: () => events.push('first waiting'), onOwner: () => events.push('first owner') });
  const second = claimGameLock({ locks: nativeLocks, onWaiting: () => events.push('second waiting'), onOwner: () => events.push('second owner') });
  await Promise.resolve();
  assert.deepEqual(events, ['first waiting', 'first owner', 'second waiting']);
  first.release();
  await first.done;
  await Promise.resolve();
  assert.deepEqual(events, ['first waiting', 'first owner', 'second waiting', 'second owner']);
  second.release();
  await second.done;
});

test('a browser without Web Locks never grants saving authority', async () => {
  let unavailable = false;
  let owner = false;
  const claim = claimGameLock({ onUnavailable: () => { unavailable = true; }, onOwner: () => { owner = true; } });
  await claim.done;
  assert.equal(claim.supported, false);
  assert.equal(unavailable, true);
  assert.equal(owner, false);
});

test('releasing while activation is pending lets the next tab acquire the lock', { timeout: 1000 }, async () => {
  const nativeLocks = locks();
  let finishActivation;
  const activation = new Promise(resolve => { finishActivation = resolve; });
  const first = claimGameLock({ locks: nativeLocks, onOwner: () => activation });
  first.release();
  let secondOwns = false;
  const second = claimGameLock({ locks: nativeLocks, onOwner: () => { secondOwns = true; } });
  finishActivation();
  await first.done;
  await Promise.resolve();
  assert.equal(secondOwns, true);
  second.release();
  await second.done;
});
