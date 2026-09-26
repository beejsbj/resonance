# Archived workshop reference

This branch preserves [PR1](https://github.com/beejsbj/resonance/pull/1), the original systems workshop, and [PR2](https://github.com/beejsbj/resonance/pull/2), its consequence edges and breach scenario. Workshop development stopped on September 26, 2026. Continue game development on [main](https://github.com/beejsbj/resonance/tree/main).

The authored ideas are intact in [the map](public/workshop/data.json), [genre research](docs/research/genre-foundations.md), and [economy comparison](docs/research/six-game-economy-comparison.md). Serve `public/` with `python3 -m http.server --directory public` and open `/workshop/` to explore the interface. Personal annotations remain in the browser and origin where they were entered; export them there to preserve them outside that browser.

This is historical material. Some gathering recommendations and confirmed/proposed labels predate settled decisions. A selected alternative connection may be absent from the diagram; edge paths lack keyboard activation, though inspector buttons offer another route. The independent [PR1 review](https://github.com/beejsbj/resonance/pull/1#pullrequestreview-5327375287) and [PR2 review](https://github.com/beejsbj/resonance/pull/2#pullrequestreview-5327375388) document those limitations. Use the product brief, context, and game build docs on main for current direction.

---

# Resonance

Resonance is a portrait Android game concept joining incremental mining and base growth, an autonomous defensive orchestra, active conductor support, and roguelite survival into one generative musical system.

[Play Prototype 03](https://resonance-musical-idle.beejsbj.chatgpt.site) · [Linear project](https://linear.app/bjs-projects/project/resonance-eebb7324eb0a) · [Wayfinding map BJS-417](https://linear.app/bjs-projects/issue/BJS-417/create-a-musical-incremental-orchestra-defense-game-for-android)

The checked-in browser prototype is playable evidence, not the production architecture. It tests whether mining, tapping, conducting, automatic defense, and musical development can feel like domains of the same game.

## Start here

- [Product brief](docs/product-brief.md): settled direction and the remaining design frontier.
- [Project language](CONTEXT.md): canonical terms and distinctions.
- [Prototype evidence](docs/prototype.md): what the current build establishes and what it does not.
- [Wayfinding entry](docs/agents/wayfinding-entry.md): start a fresh wayfinding session without losing the source conversations.
- [Session index](docs/agents/sessions.md): the union session and both original prototype sessions.

Active work, decisions, blockers, and readiness live in the Resonance Linear project. Repository docs should not mirror its changing workflow state.

## Prototype development

```bash
npm install
npm run dev
```

`npm run build` validates the hosted shell. `npm run assemble` regenerates the self-contained `public/prototype.html` from the files in `prototype/`.
