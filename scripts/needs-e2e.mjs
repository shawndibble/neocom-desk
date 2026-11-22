#!/usr/bin/env node
/**
 * Decides what e2e work this run does, for ci.yml's `build` job (`run_e2e`,
 * `e2e_shards`, `e2e_matrix`) and `tests-needed` job (`run_book`):
 *   node scripts/needs-e2e.mjs
 * and appends the answers to $GITHUB_OUTPUT.
 *
 * A pull request diffs its merge commit against the base (lib/changedFiles.mjs)
 * and runs the behaviour specs when app code changed, plus the Corp Tax Book
 * specs when their inputs did (`needsBookE2eOnPr`). A full run (`CI_FULL=true`,
 * `develop-full.yml`) runs every spec, layout ones included. Anything that does
 * not look like either answers `true`: a wasted e2e run is cheap, a skipped one
 * that mattered is not.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { changedFiles } from './lib/changedFiles.mjs';
import { shardCount, shardMatrix } from './lib/ciPlan.mjs';
import { listE2eSpecs } from './lib/e2eSpecs.mjs';
import { needsBookE2eOnPr, needsE2e } from './lib/e2eRelevance.mjs';

/** Seconds of worker time per shard to aim for (the weights are worker seconds). */
const SHARD_TARGET_WEIGHT = 400;
const MAX_SHARDS = 6;

const full = process.env.CI_FULL === 'true';
const files = full ? [] : changedFiles('needs-e2e');
const run = full || needsE2e(files);
const book = full || needsBookE2eOnPr(files);
console.log(
  `needs-e2e: ${full ? 'full run' : `${files.length} changed files`}, e2e ${run ? 'needed' : 'skipped'}, Corp Tax Book specs ${book ? 'needed' : 'skipped'}`
);
if (!run || !book) console.log(files.map((file) => `  ${file}`).join('\n'));

const specs = run ? listE2eSpecs({ skipLayout: !full }) : [];
const weights = JSON.parse(readFileSync('e2e/shard-weights.json', 'utf8'));
const shards = shardCount(specs, weights, SHARD_TARGET_WEIGHT, MAX_SHARDS);
console.log(`needs-e2e: ${specs.length} specs in ${shards} shards`);

if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `run_e2e=${run}\nrun_book=${book}\ne2e_shards=${shards}\ne2e_matrix=${shardMatrix(shards)}\n`
  );
