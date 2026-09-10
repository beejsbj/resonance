# Resonance — playable prototype

A musical incremental idle game study for BJS-417. Throwaway implementation; no claim that gameplay is validated until Burooj plays it.

Question: does buying an upgrade feel rewarding because it changes both earnings and the music?

`npm run dev -- --host 0.0.0.0 --port 5187` opens the hosted shell. `public/prototype.html` is also a single self-contained file that opens without a server. `npm run assemble` regenerates it from `prototype/`.

Tap, swipe, and hold the stage. Buy automatic voices and upgrades. Explore three modal sound worlds. Tinker offers time speeds, currency grants, an hour skip, three sample scenes, root/tempo, and reset. No ads, accounts inside the app, or external audio assets. State is intentionally in memory; refreshing starts over. An open hidden tab catches up its idle economy; a closed/reloaded tab does not retain progress.

Worlds are abstract modal studies, not historical or cultural representations. Native Android behavior, cultural/history content, store packaging, purchases, persistence and long-term balance are future work. This prototype makes no production commitments.

Source roles: `economy.js` is the portable pure economy, `audio.js` owns synthesized sound, `stage.js` renders/touches geometry, `game.js` connects them. Economy/audio assets originated from independent Luna/Sol workers, integrated by the owner. `shell.html` and `style.css` define the playable surface.
