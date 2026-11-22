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
 * The Corp Tax Book specs (`e2e/*.book.spec.ts`, ci.yml's `e2e-book`) drive the real Cloud
 * Functions and Firestore rules in the emulators, so the backend is not safe to skip for them:
 * the list above less `functions/` (bar its unit tests), the rules and the emulator config.
 */
const BOOK_INPUTS = [
  /^functions\//,
  /^firestore\.(rules|indexes\.json)$/,
  /^firebase\.json$/,
  /^\.firebaserc$/,
];
const BOOK_SAFE = [
  ...SAFE.filter((pattern) => !BOOK_INPUTS.some((input) => input.source === pattern.source)),
  /^functions\/src\/.*\.test\.ts$/,
];

/** True unless every file matches a pattern of `safe`; an empty list means the diff failed. */
const needsRun = (changedFiles, safe) =>
  changedFiles.length === 0 ||
  changedFiles.some((file) => !safe.some((pattern) => pattern.test(file)));

/**
 * @param {string[]} changedFiles repo-relative paths, `/`-separated
 * @returns {boolean} false only when every file is known not to affect e2e
 */
export function needsE2e(changedFiles) {
  return needsRun(changedFiles, SAFE);
}

/**
 * @param {string[]} changedFiles repo-relative paths, `/`-separated
 * @returns {boolean} false only when every file is known not to affect the Corp Tax Book specs
 */
export function needsBookE2e(changedFiles) {
  return needsRun(changedFiles, BOOK_SAFE);
}

/**
 * What the Corp Tax Book specs can see on a PR: the backend and emulator
 * config, their own harness and specs, and the tax, mining and moons code they
 * drive (`/mining/tax`, `/corp-tax-book/verify`, `/corp/moons`). The wider
 * `needsBookE2e` also runs them for any other app change; that is the full
 * run's job (`develop-full.yml`), since this job alone takes ~11 minutes.
 */
const BOOK_PR_INPUTS = [
  /^functions\//,
  /^firestore\.(rules|indexes\.json)$/,
  /^firebase\.json$/,
  /^\.firebaserc$/,
  /^playwright\.book\.config\.ts$/,
  /^scripts\/e2e-book\//,
  /^e2e\/(support\/taxBook|.*\.book\.spec\.ts$)/,
  /^src\/.*(tax|mining|moon|sync|db\/)/i,
];

/**
 * @param {string[]} changedFiles repo-relative paths, `/`-separated
 * @returns {boolean} true when a PR's change can reach the Corp Tax Book specs
 */
export function needsBookE2eOnPr(changedFiles) {
  if (changedFiles.length === 0) return true;
  return (
    needsBookE2e(changedFiles) &&
    changedFiles.some(
      (file) =>
        BOOK_PR_INPUTS.some((pattern) => pattern.test(file)) &&
        !/^functions\/src\/.*\.test\.ts$/.test(file) &&
        !/^src\/.*\.test\.tsx?$/.test(file)
    )
  );
}
