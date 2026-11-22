/**
 * How much of the suite a CI run does, for `ci.yml`'s planning jobs.
 *
 * A pull request runs what its change can reach: the unit tests whose import
 * graph holds a changed file, and the e2e specs that check behaviour. The whole
 * suite, layout specs included, runs on `develop` (`develop-full.yml`) and on a
 * `workflow_dispatch` with `full`. Every rule here errs toward running more:
 * the cost of a stale rule is a slower PR, never an unrun check.
 */
import { totalWeight } from './e2eShards.mjs';

/**
 * Specs that measure geometry (overflow, clipping, control heights, widths) at
 * a phone or desktop size. They are the bulk of the e2e suite and move after
 * the merge. A spec whose name matches nothing here counts as behaviour and
 * stays on the PR.
 */
const LAYOUT_SPEC =
  /(Narrow|Wide|Heights|Overflow|Clearance|Fit|Alignment|Widths|HeaderWrap|Sticky|Cue|PhoneLayout|PhoneTab|HeightBudget|Columns|Grid|WidthCap|RowWidths|Align|Wrap)/;

/** @param {string} file e.g. `e2e/marketOrderBookNarrow.spec.ts` */
export const isLayoutSpec = (file) => LAYOUT_SPEC.test(file.replace(/^.*\//, ''));

/**
 * Shards needed to keep each near `targetWeight`, between 1 and `max` and never
 * more than there are files; 0 when there is nothing to run.
 * @param {string[]} files
 * @param {Record<string, number>} weights
 */
export function shardCount(files, weights, targetWeight, max) {
  if (files.length === 0) return 0;
  const byWeight = Math.ceil(totalWeight(files, weights) / targetWeight);
  // Never more shards than files: a shard with nothing to run is an error.
  return Math.min(max, files.length, Math.max(1, byWeight));
}

/** A GitHub Actions matrix: `[1,2,3]` for three shards, `[]` for none. */
export const shardMatrix = (count) =>
  JSON.stringify(Array.from({ length: count }, (_, i) => i + 1));

/**
 * Changes that can move any test, so `--changed` must not narrow the run:
 * dependencies, build and test config, shared test support, the CI planning
 * itself. Vitest already reruns everything for its own config; the rest is here.
 */
const FULL_UNIT_RUN = [
  /^package(-lock)?\.json$/,
  /^vite\.config\.ts$/,
  /^vitest\./,
  /^tsconfig[^/]*\.json$/,
  /^src\/test\//,
  /^scripts\/(test-shard|needs-tests|select-tests|e2e-shard)/,
  /^scripts\/lib\/(testShards|ciPlan|e2eShards|testRelevance)/,
  /^\.github\/workflows\/(ci|develop-full)\.yml$/,
];

/**
 * @param {string[]} changedFiles repo-relative paths
 * @returns {boolean} true when the run must cover every test file
 */
export function needsFullUnitRun(changedFiles) {
  // An empty list means the diff itself failed.
  if (changedFiles.length === 0) return true;
  return changedFiles.some((file) => FULL_UNIT_RUN.some((pattern) => pattern.test(file)));
}

/**
 * Test files out of `vitest list --filesOnly`, whose lines look like
 * `[dom] src/routes/Assets.test.tsx` (the project in brackets).
 * @param {string} stdout
 * @returns {string[]} sorted, de-duplicated repo-relative paths
 */
export function parseVitestListFiles(stdout) {
  const files = new Set();
  for (const line of stdout.split('\n')) {
    const match = line.trim().match(/^(?:\[[^\]]+\]\s+)?(\S+\.(?:test|spec)\.[cm]?[jt]sx?)$/);
    if (match) files.add(match[1]);
  }
  return [...files].sort();
}
