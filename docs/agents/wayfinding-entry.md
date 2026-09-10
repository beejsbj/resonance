# Wayfinding entry

Use this entry when starting the next Resonance session with `$cockpit` and `$mattpocock-skills:wayfinder` from the repository root.

## Objective

Turn the game's remaining fog into a Linear decision map whose resolved conclusions can later be collapsed through `to-spec`. Produce decisions during this phase, not production implementation.

## Start

1. Read `AGENTS.md`, `CONTEXT.md`, `docs/product-brief.md`, and `docs/prototype.md`. The start is complete when the settled direction, rejected ladder, and prototype's unanswered questions can each be stated without contradiction.
2. Read `docs/agents/sessions.md`. Open a primary session only where its rationale is needed; the index is complete when all three source conversations are reachable.
3. Read `docs/agents/issue-tracker.md`, then inspect BJS-417 with `cockpit linear issue BJS-417 --json`. The tracker read is complete when its live children, relations, labels, and unresolved threads are known.
4. Run the wayfinder flow with BJS-417 as its map root. Preserve BJS-416 as prior defense-domain work and reconcile it into the map rather than recreating it.

The progression grammar is the strongest known first decision candidate: determine which tempo, rhythm, pitch, harmony, register, articulation, dynamics, and phase changes belong globally, to an instrument, to an arrangement, to a run, or to permanent progression. Wayfinder may reorder that frontier if its dependency map shows a stronger prerequisite.

## Handoff bound

Wayfinding is ready to leave only when every mapped decision is resolved, canceled with a reason, or represented by an explicit open child with native blocker edges; settled language has graduated into `CONTEXT.md` or `docs/product-brief.md`; and BJS-417 contains a receipt pointing to the resulting map state. Then continue through `to-spec`, not directly into implementation unless the whole effort proved genuinely small.
