/**
 * Whether a PR's changed files can affect the Playwright suite. `ci.yml` runs
 * the six `e2e-shard` jobs only when this says so; docs, backend-only and
 * test-only PRs skip them.
 *
 * Deliberately a list of paths that are SAFE to skip, not of app paths: a file
 * nobody listed (a new top-level directory, a script that feeds the build)
 * runs e2e, so the failure mode of a stale list is a wasted run and never a
 * missed regression.
 */
const SAFE = [
  /^docs\//,
  /^[^/]+\.md$/,
  /^\.claude\//,
  /^\.husky\//,
  /^functions\//,
  /^rules-tests\//,
  /^firestore\.(rules|indexes\.json)$/,
  /^firebase\.json$/,
  /^\.firebaserc$/,
  // Every workflow but ci.yml, which defines the e2e job itself.
  /^\.github\/(?!workflows\/ci\.yml$)/,
  // Unit tests are not part of the bundle e2e drives.
  /^src\/.*\.test\.tsx?$/,
  /^(LICENSE|\.gitignore|\.prettierignore|\.prettierrc|\.out-of-scope|\.mcp\.json|\.env\.example)$/,
];

/**
 * @param {string[]} changedFiles repo-relative paths, `/`-separated
 * @returns {boolean} false only when every file is known not to affect e2e
 */
export function needsE2e(changedFiles) {
  // An empty list means the diff itself failed, not that nothing changed.
  if (changedFiles.length === 0) return true;
  return changedFiles.some((file) => !SAFE.some((pattern) => pattern.test(file)));
}
