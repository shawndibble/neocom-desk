import { totalWeight } from './e2eShards.mjs';

const LAYOUT_SPEC =
  /(Narrow|Wide|Heights|Overflow|Clearance|Fit|Alignment|Widths|HeaderWrap|Sticky|Cue|PhoneLayout|PhoneTab|HeightBudget|Columns|Grid|WidthCap|RowWidths|Align|Wrap)/;

export const isLayoutSpec = (file) => LAYOUT_SPEC.test(file.replace(/^.*\//, ''));

export function shardCount(files, weights, targetWeight, max) {
  if (files.length === 0) return 0;
  const byWeight = Math.ceil(totalWeight(files, weights) / targetWeight);
  return Math.min(max, files.length, Math.max(1, byWeight));
}

export const shardMatrix = (count) =>
  JSON.stringify(Array.from({ length: count }, (_, i) => i + 1));

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

export function needsFullUnitRun(changedFiles) {
  if (changedFiles.length === 0) return true;
  return changedFiles.some((file) => FULL_UNIT_RUN.some((pattern) => pattern.test(file)));
}

export function parseVitestListFiles(stdout) {
  const files = new Set();
  for (const line of stdout.split('\n')) {
    const match = line.trim().match(/^(?:\[[^\]]+\]\s+)?(\S+\.(?:test|spec)\.[cm]?[jt]sx?)$/);
    if (match) files.add(match[1]);
  }
  return [...files].sort();
}
