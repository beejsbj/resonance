# Resonance — orchestra defense prototype

A merged musical idle/incremental and radial orchestra-defense study for BJS-416 and BJS-417. Throwaway implementation; no claim that the combined gameplay is validated until Burooj plays it.

Question: can conductor support powers, autonomous instrument towers, and idle mining/base growth feel like different domains of one game?

`npm run dev -- --host 0.0.0.0 --port 5187` opens the hosted shell. `public/prototype.html` is also a single self-contained file that opens without a server. `npm run assemble` regenerates it from `prototype/`.

Build violin, drum, and bell towers around a central conductor. Tap to accent a structure, swipe to push enemies, hold to ward an area, and let the conductor sing. Mines produce Resonance every four beats, including while the page is away or closed; active danger never advances in the background. Local prototype progress is saved in this browser and offline mining is capped at eight hours per return.

Six escalating waves lead to an explicitly started boss crisis. After the third wave, one conductor-power evolution supplies a small roguelite comparison. Instrument growth makes solo voices become pairs and sections, with an electric transformation. Tinker can jump to the first defense, a growing orchestra, or the waiting boss, simulate away time, grant currency, change tempo/mode, and reset the study.

Worlds remain abstract modal studies, not historical or cultural representations. Free placement, Resonance as currency, forgiving retries, exact enemies, tower balance, persistent browser state, and the boss are provisional test choices. Native Android behavior, cultural/history content, store packaging, purchases, cloud persistence, long-term progression, and final run structure remain future work.

Source roles: `defense.js` is the portable DOM-free simulation, `audio.js` owns synthesized sound, `stage.js` renders the arena and classifies exclusive gestures, and `game.js` connects them. The earlier `economy.js` remains as a recoverable reference for the first study's progression/world data. `shell.html` and `style.css` define the playable surface.
