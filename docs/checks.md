# Checks, hooks and PR gates

What runs where, so a change is checked before it merges and a PR carries its evidence.

| Where                          | What runs                                                                                                                     | Source                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `git commit` (pre-commit hook) | `npm run lint`, `format:check` on the staged files, and `npm test`. Docs-only commits skip all three.                         | `.githooks/pre-commit`, `scripts/pre-commit.mjs`      |
| Every PR and push to `main`    | `ci`: `npm ci`, lint, format check, full `npm test`, `npm run build`                                                          | `.github/workflows/ci.yml`                            |
| Every PR                       | `verification-section`, `test-integrity` (re-run when the description is edited)                                              | `.github/workflows/pr-gates.yml`, `scripts/pr-gates/` |
| Every PR and push to `main`    | `privacy-scan`: personal paths, emails and identities in what the PR adds (the whole tree on `main`), and a missing `LICENSE` | `.github/workflows/privacy.yml`, `scripts/privacy/`   |
| Every PR                       | `review-evidence`: every review thread resolved, with a reply that shows why                                                  | `.github/workflows/review-evidence.yml`               |

## Types, lint and format

- **Types.** There is no separate type checker. `oxlint` runs type-aware (`typeAware` and `typeCheck` in `.oxlintrc.json`), so TypeScript errors in `app/`, `components/`, `hooks/` and `lib/` fail `npm run lint`. The game in `public/play/` is plain JavaScript and is not type-checked.
- **Lint baseline.** `.oxlintrc.json` has two `overrides` that keep the code that was already there from failing while any new violation does: `prototype/economy.js` may use `var` (the prototype is preserved as evidence, see [prototype.md](prototype.md)), and the generated shadcn code in `components/ui/` and `hooks/use-mobile.ts` is exempt from the `jsx-a11y` and `react-compiler` rules. Fix a violation by editing the code, not by widening an override.
- **Format baseline.** The code was written before a formatter was wired, and 32 files do not match `oxfmt`. They are listed in the `ignorePatterns` of `.oxfmtrc.json`, so `npm run format:check` passes today and fails for any new or un-ignored file that is not formatted. To pay a file off, run `npx oxfmt <file>` and delete its line from `ignorePatterns`. Editing a listed file does not require formatting it, so a legacy file may stay as it is until someone chooses to reformat it in a commit of its own.
- **Build.** `npm run build` (`npm run assemble && vinext build`) needs no Cloudflare, Vercel or OpenAI credentials. It reads `.openai/hosting.json` (checked in, with no secrets) and writes only ignored paths (`dist/`, `.vinext/`) plus the regenerated `public/prototype.html`.

## The hook

`npm ci` runs `prepare`, which sets `core.hooksPath=.githooks` (`scripts/install-hooks.mjs`). The setting lives in the repository's shared git config, so every worktree of the checkout gets the hook once it has installed dependencies. A commit in a worktree with no `node_modules` fails with an instruction to run `npm ci`; it does not skip quietly. The installer does nothing in CI, on Vercel, outside a git checkout, or when `core.hooksPath` is already set to something else.

`node:test` has no "related tests" selector, so any staged code runs the whole suite (about 20 seconds; two of the six test files drive headless Chrome, which is found through `CHROME_BIN` or the usual install paths). Skip once with `git commit --no-verify`; CI is the backstop and runs the same checks. `.githooks/pre-push` scans what is about to leave the machine with the same privacy scanner CI runs; skip once with `git push --no-verify`.

## Gate 1: a Verification section

The PR description must contain a `## Verification` section with at least 30 characters that are not a placeholder: the commands you ran and what they showed, or `Not run: <why>`. The PR template (`.github/pull_request_template.md`) has the heading. An empty section, `TODO`, `n/a`, or only the template's comment fails.

## Gate 2: tests deleted, skipped or loosened

The check diffs every test file (`*.test.*`, `*.spec.*`, anything under `__tests__/`) against the PR's merge-base and fails when it finds, without a stated reason: a deleted test file (`deleted-file`), an added skip, `.only`, `.todo` or `{ skip: true }` (`skipped`), a test title that is gone or fewer test cases than before (`removed-tests`), fewer `expect(...)` calls (`removed-assertions`), a stricter `expect` matcher turned weaker (`weakened`), or a number that grew on a line naming a tolerance (`widened`).

A stated reason is one line in the PR description: `Test change: <why this is right>` (20 or more characters). One line covers every finding in the PR.

**Limits specific to this repository.** The tests use `node:test` and `node:assert`, not `expect(...)`. The delete, skip and removed-test checks work. `removed-assertions` and `weakened` read `expect(...)` only, so a weaker `assert.*` (an `assert.equal` turned into `assert.ok`, a wider `assert.ok(Math.abs(a - b) < tol)`) goes unseen. Also unseen: a skip written mid-line, a loosening spread over several lines, a weaker assertion hidden in a helper, a raised `timeout`, and tests moved out of `test/` or off the `*.test.*` name. The gates guard against accidents, not adversaries: a PR can edit `scripts/pr-gates/`, so review of that directory matters. Their own tests are `scripts/pr-gates/pr-gates.test.mjs`, part of `npm test`.

## Privacy and licence

`scripts/privacy/privacy-scan.mjs` holds no personal identifier. Its structural rules flag any home-directory path, machine mount or email address. Names, hostnames and other private words come from the `PRIVACY_PATTERNS` Actions secret in CI and `~/.config/privacy-scan/patterns` on a developer machine; neither lives in the repo. Until the secret exists the CI job runs the structural rules only and says so. Intentionally public values go in `.github/privacy-allow.txt`, with the narrowest rule that works. The scan misses `user@host` prompts, values in images and binaries, obfuscated addresses and git history before a PR. The licence is MIT (`LICENSE`).

## Making the checks required

A workflow that fails does not block a merge by itself. Merging is blocked by the `baseline` ruleset on `main` (cockpit issue 62): required checks `ci`, `verification-section`, `test-integrity`, `privacy-scan` and `review-evidence`, resolved review conversations, no force-push and no deletion, no bypass actors. The check names must exist on `main` before they can be required, so the ruleset is applied after this change merges. See issue #4.
