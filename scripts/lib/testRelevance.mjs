/**
 * Whether a PR's changed files can affect the vitest suite. `ci.yml` runs the
 * four `test-shard` jobs only when this says so; a docs-only PR skips them
 * (`test` still reports).
 *
 * Narrower than `e2eRelevance.mjs` on purpose: backend, workflow and test
 * files DO run vitest (`functions/` has its own gate, but a changed unit test
 * is exactly what must run). Only prose that no test reads is safe, and no
 * test reads `docs/`, `.claude/` or a Markdown file. Like that list, this one
 * names what is safe to skip, so an unlisted path runs the tests.
 */
const SAFE = [
  /^docs\//,
  /^[^/]+\.md$/,
  /^\.claude\//,
  /^\.out-of-scope\//,
  /^(LICENSE|\.gitignore|\.prettierignore)$/,
];

/**
 * @param {string[]} changedFiles repo-relative paths, `/`-separated
 * @returns {boolean} false only when every file is known not to affect vitest
 */
export function needsTests(changedFiles) {
  // An empty list means the diff itself failed, not that nothing changed.
  if (changedFiles.length === 0) return true;
  return changedFiles.some((file) => !SAFE.some((pattern) => pattern.test(file)));
}
