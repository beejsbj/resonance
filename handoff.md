# Handoff: Resonance game build (2026-09-25)

Written for the cloud worker picking up this session. Read `AGENTS.md`, then `docs/game.md`, before changing anything.

## The ask

Burooj asked for the real game, not a map of it. His words: "take full ownership of it and see what you come up with using my current work as the seed." Prototype 03, `docs/product-brief.md` and `CONTEXT.md` are the seed. Design calls on open questions are Claude's to make, but they must stay listed in `docs/game.md` as provisional until Burooj accepts them. Do not graduate them into the brief or CONTEXT on your own.

## Where things are

| Branch | State | PR |
|---|---|---|
| `work/visual-workshop-vercel` | Workshop plus Vercel hosting, based on `main` | [#1](https://github.com/beejsbj/resonance/pull/1) → `main` |
| `work/workshop-consequence-edges` | Workshop: consequence edges, conductor split, breach trace | [#2](https://github.com/beejsbj/resonance/pull/2) → #1's branch |
| `work/game-first-build` | **The game.** Based on `work/visual-workshop-vercel`, independent of #2 | not opened yet |

The game is at `public/play/`. It uses dependency-free ES modules and has no build step. Vercel redirects `/` to `/play/`. The prototype stays at `/prototype.html` and the workshop at `/workshop/`.

- `src/content.js`: every tunable number (beings, enemies, costs, motifs, echoes).
- `src/sim.js`: DOM-free rules. It mutates state in place and returns events stamped with sim-time `t`.
- `src/harmony.js`: the shared chord progression, per-identity figures, and pitch colours.
- `src/audio.js`: synthesized voices, scheduled at `event.t + offset`.
- `src/render.js`: the canvas stage.
- `src/main.js`: clock, input, panels, save and load, offline, onboarding, overlays. `window.__resonance` exposes `{ state, S, stage, sound }` for debugging and headless tests.
- `test/sim.test.js` (`npm test`, 11 passing) and `scripts/balance.mjs` (`npm run balance`: idle, manager and active bots).

## Verified so far

- Tests pass and oxlint is clean on `public/play`, `test` and `scripts/balance.mjs`.
- Balance at an enemy HP growth of 1.18 per wave: an idle run falls around wave 4; a managed run reaches about wave 37 in about 35 minutes. The bots play near-optimally, so human runs will be shorter. Tune after real play.
- A headless mobile playthrough (390×844) got from Begin through taps, placement and a well to wave 1, with no console errors. A late-game stress wave (crisis, 8+ beings) also ran with no errors.
- Render cost: the coverage layer is now cached, taking a frame from 44 ms to 0.6 ms in headless software rendering. `drawBeings` is the next hotspot (about 4.7 ms software with 8 beings, from a radial gradient plus bloom per being). A real GPU is probably fine; check on a device.
- Audio: oscillators start and schedule. The interlude master bus measured peak 0.087 and RMS 0.012, which is probably too quiet. The late-wave level measurement was killed (exit 137) before it reported.

## Unfinished, in priority order

1. **Independent bug review.** A reviewer agent was reading sim, input, audio and save/load for real bugs when the session moved, and it never reported. Re-run it: read-only, with findings verified and marked CONFIRMED or PLAUSIBLE. Suspects worth checking:
   - `openFall` calls `endRun`. Can it run twice, for example on reload after a defeat?
   - Is offline time settled twice? `loadRun` settles, and so does the `visibilitychange` handler.
   - Hold detection is a `setTimeout` in `pointerdown`.
   - Placement mode can persist after a failed place.
2. **Loudness.** Measure the late-wave level (the script pattern is in the git history: an analyser on `sound.master`). Raise master gain or per-voice levels so the interlude isn't near-silent, without clipping in dense waves. The compressor is at -20 dB threshold.
3. **Open the game PR** from `work/game-first-build`, based on `work/visual-workshop-vercel` (stacked on #1). Link it with the t3-code `link_pull_request` tool if you have it. Get the Vercel preview URL from the PR checks. Previews are behind Vercel deployment protection, so Burooj must be signed in.
4. **Device check on Android.** Install as a PWA, then check the frame rate, touch gestures (tap, swipe, hold, drag from a chip), and audio unlock.
5. **Balance after human play.** Change numbers only in `content.js`. Re-run `npm test` and `npm run balance` after any change to rules or numbers.

## Rules that stay fixed

- Recruitment (awakening), arrangement (placement), musical development, instrument identity and conductor powers stay distinct in code and language.
- No identity-changing upgrade ladder. Timing never gates income. Offline time never advances danger.
- Host on GitHub plus Vercel only. Never publish to ChatGPT Sites.
- Commit in small, verified checkpoints, and name the checks in each commit message. Author commits as `beejsbj`: Vercel rejects other authors.
- Unresolved design work goes in Linear (BJS-417 is the map; BJS-416 is the defense domain), not in a Markdown status list. On bjslab, Linear goes through `cockpit linear`; the cloud worker may not have it, so leave board updates to Burooj or a bjslab session if it doesn't.
