# The game build

`public/play/` is the first build of Resonance as a game rather than a study. It is a portrait web game that installs as a PWA on Android. Burooj asked for the real game on 2026-09-24, with Claude taking ownership of the design. Prototype 03 and the settled direction in [product-brief.md](product-brief.md) were the seed.

This build is still evidence: it does not settle the design. Where the brief or Linear left a question open, the build takes a position so the game can be played. Every such call is listed below so it can be kept, changed, or thrown out after play. Settled language stays in `CONTEXT.md` and the brief. Nothing here graduates until Burooj accepts it.

## How it plays

- **Conduct.** Every tap earns Resonance. A tap on a dark shape (the Hush) strikes it directly. A tap on one of your beings accents its next two attacks and opens its panel. Swipe to gust enemies back; hold a finger down to shelter the structures under it; *Sing* swells the orchestra and the wells.
- **Gather.** Dashed crystals are dormant ground. Build a well on one and it pays on every bar, including while you are away.
- **Wake and arrange.** Sleeping beings (dashed, breathing circles) wake when your pulse reaches them and you pay to awaken them. Awakened beings wait in the roster below the arena. Drag one into the lit area to place it; it plays and fights automatically from there.
- **Develop.** Each being has four developments: mastery, subdivision, octave, and reach. A being never becomes a different being.
- **Survive.** Waves arrive on their own after each interlude. *Call the wave* brings the next one early for a bonus. Every fifth wave is a crisis with the Great Hush. The run ends when the conductor falls; echoes then buy a stronger start next time.

## Design calls made for this build

| Open question | The build's answer | Where |
|---|---|---|
| What happens beyond a destroyed relay? (the breach scenario) | Beings beyond the gap keep acting, uncoordinated: they drop half their entrances, stray off the beat and off the chord, and do 75% damage. Wells beyond it yield half and keep what they stored. Rebuilding or rerouting reconnects them. | `sim.js` `network`, `onTick`, `wellYield` |
| Which entities relay the pulse? | The conductor and every placed, living being. Wells do not relay. Each identity has its own relay reach, and Drone reaches farthest. | `content.js` `BEINGS.*.relay` |
| How does one tap choose between striking and supporting? | One touch, one intention: an enemy under the finger is struck; otherwise an own being there is accented. It always earns. | `sim.js` `tap` |
| What constrains tap attacks? | Conductor power. An off-beat strike costs 4; an on-beat strike costs nothing. Timing rewards skill without gating income or damage. "On the beat" means the beat as heard: a tap is judged from the moment the finger lands, corrected for audio latency. | `CONDUCTOR`, `tap` |
| Do performers sound when nothing threatens them? | Yes, quietly and only on the beat. The base is always a performance. | `onTick` |
| How is harmony kept while voices change? | One four-bar progression (i–VI–III–VII in D minor). Each identity reads the chord through its own figure and register. | `harmony.js` |
| Recruitment versus placement cost | Awakening costs Resonance; placing and moving are free. Arrangement is a musical decision, not a purchase. | `awaken`, `place`, `lift` |
| Separate mining or orchestra income? | Separate mining (wells), as in the current recommendation. Kills and wave clears add smaller amounts. | `wellYield`, `hurtEnemy`, `finishWave` |
| How do crises differ, and can an idle player survive one? | The Great Hush grows a shell at half health. The shell cracks on its own after 14 s; a swipe breaks it at once and leaves the Hush exposed to 60% more damage. Its telegraphed sweeps reward holding a shelter. Live play helps a lot but is not strictly required. | `updateBoss`, `gust` |
| What persists after defeat? | Only echoes (five small head starts) and a codex of identities met. The base, roster, wells, and development reset. | `endRun`, `ECHOES` |
| Roguelite variation | Motifs: after waves 3, 7, 12, 17, 23 and 30, choose one of three. An ignored offer resolves itself when the next wave begins, so idle play never stalls. | `MOTIFS`, `finishWave` |
| Offline | Wells settle up to eight hours at their last connection state. Danger never advances. A wave interrupted by leaving waits paused, and the conductor waits with it: power and the Sing cooldown recover only between waves, so leaving is never a way to catch a breath mid-fight. | `settleAway`, `main.js` visibility handling |
| Defeated crisis | The Great Hush becomes music: a new sleeping being appears where it fell. | `hurtBoss` |

Rejected ideas stay rejected. There is no identity-changing upgrade ladder, no rhythm gate on income, and no offline danger.

## What to learn by playing

1. Is the breach legible? When a relay falls, can you see and hear the outpost go uncoordinated, and does rebuilding feel worth its cost against upgrading?
2. Does the one-touch rule (strike, else accent) feel natural, or does it misfire?
3. Is on-beat tapping a pleasure you choose, rather than a chore?
4. Does the music stay beautiful as the orchestra gets dense, and can you tell the identities apart by ear?
5. Where does the first run end, and does the echo shop make you want another?

## Working on it

- Run the game: `cd public && python3 -m http.server`, then open `/play/`. On Vercel, `/` redirects to `/play/`. The prototype stays at `/prototype.html` and the workshop at `/workshop/`.
- Tests: `npm test`. The simulation is DOM-free, so its rules are tested directly.
- Balance: `npm run balance`. Idle, managing, and active bots play whole runs and report how far each got. The numbers live in `public/play/src/content.js`.
- Loudness: `npm run loudness`. Headless Chromium plays saved runs from the first interlude to a dense late wave and meters the speaker output; it fails if anything clips. Run it after changing voices, levels, or the mix. The mix lifts a small orchestra (`Sound.setVoices`) and a limiter guards the dense end.
- The service worker caches the shell. Bump `CACHE` in `sw.js` when shipping changes users must receive at once.
