# Linear tracker contract

Linear is the source of truth for workflow state. Use the **Resonance** project in the BJS team and write only through `cockpit linear …` so changes are authored by Cockpit.

- Project: https://linear.app/bjs-projects/project/resonance-eebb7324eb0a
- Canonical wayfinding map: BJS-417
- Existing defense-domain child: BJS-416

## Wayfinder representation

- A map is a root issue labeled `wayfinder:map`.
- Each decision is a native child labeled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task` according to the work required.
- Use native `blocks` relations for prerequisites. `SOURCE blocks TARGET`.
- Determine the frontier from open children, inbound blockers, and assignment state. The body records settled context; unresolved dialogue belongs in the Grilling or Questions thread.

## Issue bar

Each issue gives a cold worker one concrete Goal, enough Context to avoid reopening settled questions, observable Done-when evidence, and real Constraints. Questions for Burooj go in the Questions thread. Receipts and transitions go through Cockpit comments.

Use Cockpit lanes by their actual next actor: `Grilling` for interactive shaping, `Ready for Burooj` with a current decision brief, `Ready for agent` only for a cold-dispatchable issue, `In Progress` with exactly one session binding, and `Blocked` only with an explicit blocker. Release session bindings before `Done` or `Canceled`.

## Generic operations

```bash
cockpit linear issue BJS-417 --json
cockpit linear create --title "..." --project Resonance --parent BJS-417 --label wayfinder:grilling
cockpit linear update BJS-123 --description-file /path/to/body.md --expected-updated-at <updatedAt>
cockpit linear relation-add BJS-123 blocks BJS-456
cockpit linear comment BJS-123 --grilling --body-file /path/to/comment.md
cockpit linear bind BJS-123 codex <session-id> --move-state "In Progress"
cockpit linear release BJS-123
```

A planning or decision issue closes only when its promised answer exists and its resolution receipt names the evidence. Implementation additionally requires accepted review evidence.
