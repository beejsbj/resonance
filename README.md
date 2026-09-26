# Resonance

Resonance is a portrait game joining incremental mining and base growth, an autonomous defensive orchestra, active conductor powers, and roguelite survival into one generative musical system. The current browser game installs as a PWA on Android.

[Game build](docs/game.md) · [Linear project](https://linear.app/bjs-projects/project/resonance-eebb7324eb0a) · [Design map BJS-417](https://linear.app/bjs-projects/issue/BJS-417/create-a-musical-incremental-orchestra-defense-game-for-android)

The game in `public/play/` is the starting point for further development. On September 26, 2026, Burooj reported that Opus's build in [PR3](https://github.com/beejsbj/resonance/pull/3) plays great and chose it as the start line. Its individual design choices remain open to revision through play.

## Start here

- [Game build](docs/game.md): how to play, run, and verify the current game, and the provisional design choices it makes.
- [Product brief](docs/product-brief.md): settled direction and the remaining design frontier.
- [Project language](CONTEXT.md): canonical terms and distinctions.
- [Prototype evidence](docs/prototype.md): the earlier Prototype 03 study that helped seed the game.
- [Wayfinding entry](docs/agents/wayfinding-entry.md): start a fresh wayfinding session without losing the source conversations.
- [Session index](docs/agents/sessions.md): the union session and both original prototype sessions.

Active work, decisions, blockers, and readiness live in the Resonance Linear project. Repository docs should not mirror its changing workflow state.

## Run the game

```bash
cd public
python3 -m http.server
```

Open `http://localhost:8000/play/`. The game uses browser ES modules without a build step. Run `npm test` for simulation and regression checks. Vercel serves the game at `/play/` and redirects `/` there.

## Design references

The [archived workshop branch](https://github.com/beejsbj/resonance/tree/workshop) preserves both workshop PRs: the original systems map and its consequence edges and breach scenario. Development now focuses on the game.

The authored ideas remain in [map data](https://github.com/beejsbj/resonance/blob/workshop/public/workshop/data.json), [genre research](https://github.com/beejsbj/resonance/blob/workshop/docs/research/genre-foundations.md), and [economy comparison](https://github.com/beejsbj/resonance/blob/workshop/docs/research/six-game-economy-comparison.md). To explore the archived interface, check out `workshop`, serve `public/`, and open `/workshop/`.

Workshop annotations are stored in the browser where they were entered. Use the workshop's export button on that same browser and origin to preserve them; they are not automatically saved to Git or Linear.

## Prototype development

```bash
npm install
npm run dev
```

`npm run build` validates the hosted shell. `npm run assemble` regenerates the self-contained `public/prototype.html` from the files in `prototype/`.
