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
