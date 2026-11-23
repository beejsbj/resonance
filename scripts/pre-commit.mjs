#!/usr/bin/env node
// Pre-commit: lint, format check on the staged files, and the test suite.
// The same npm scripts CI runs, so the baselines in .oxlintrc.json and .oxfmtrc.json apply.
// Tests: node:test has no "related tests" selector, so any staged code runs the whole
// suite (about 20 s, two of the six files drive headless Chrome). Docs-only commits skip all of it.
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FORMATTABLE = /\.(?:[cm]?[jt]sx?|json|css|html)$/;
const NOT_CODE =
  /\.(?:md|mdx|txt|png|jpe?g|svg|webp|ico|woff2?|webmanifest)$|^docs\/|^LICENSE$/;

export function stagedFiles() {
  return execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMRD'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);
}

/** The checks to run for a set of staged files, in order. Empty when only docs or assets are staged. */
export function plan(
  files,
  exists = (path) => existsSync(resolve(root, path)),
) {
  if (!files.some((file) => !NOT_CODE.test(file))) return [];
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const format = files.filter((file) => FORMATTABLE.test(file) && exists(file));
  return [
    { name: 'lint', command: npm, args: ['run', '--silent', 'lint'] },
    ...(format.length
      ? [
          {
            name: 'format',
            command: npm,
            args: [
              'run',
              '--silent',
              'format:check',
              '--',
              '--no-error-on-unmatched-pattern',
              ...format,
            ],
          },
        ]
      : []),
    { name: 'tests', command: npm, args: ['test', '--silent'] },
  ];
}

function main() {
  const steps = plan(stagedFiles());
  if (!steps.length) {
    console.log(
      'pre-commit: nothing staged, or only docs/assets: skipping checks.',
    );
    return 0;
  }
  if (!existsSync(resolve(root, 'node_modules'))) {
    console.error(
      'pre-commit: node_modules is missing, so the checks cannot run. Run `npm ci` (or skip once with `git commit --no-verify`; CI will still run them).',
    );
    return 1;
  }
  for (const step of steps) {
    console.log(`\npre-commit: ${step.name}`);
    const started = Date.now();
    const result = spawnSync(step.command, step.args, {
      cwd: root,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      console.error(
        `\npre-commit: ${step.name} failed (exit ${result.status ?? result.signal}). Fix it, or skip once with \`git commit --no-verify\` (CI will still run it).`,
      );
      return result.status ?? 1;
    }
    console.log(
      `pre-commit: ${step.name} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
