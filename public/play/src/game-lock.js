// One run may own same-origin persistence at a time. Web Locks are held by the
// browser, so a crashed or closed tab cannot leave behind a stale mutex.
export const GAME_LOCK = 'resonance-active-game-v1';

export function claimGameLock({ locks, onWaiting, onOwner, onUnavailable, onError }) {
  if (!locks || typeof locks.request !== 'function') {
    onUnavailable?.();
    return { supported: false, release() {}, done: Promise.resolve() };
  }

  let released = false;
  let unlock;
  const releasedPromise = new Promise(resolve => { unlock = resolve; });
  onWaiting?.();
  const done = locks.request(GAME_LOCK, { mode: 'exclusive' }, async () => {
    if (released) return;
    await onOwner?.();
    await releasedPromise;
  }).catch(error => onError?.(error));

  return {
    supported: true,
    release() { released = true; unlock?.(); },
    done,
  };
}
