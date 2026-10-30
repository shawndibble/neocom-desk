#!/usr/bin/env node
/**
 * Lists the tests over the time budget, for ci.yml's `test-shard` job:
 *   node scripts/test-budget.mjs vitest-timing-1.json   (markdown on stdout)
 *
 * Reads the Vitest JSON report. Budget: a unit test runs under 1s. It only
 * reports and never fails the job: CI runner speed swings by half from run to
 * run, so a hard limit would be a flaky test. A test that stays on the list
 * across runs needs a faster rewrite or a comment saying why it is slow.
 */
import { readFileSync } from 'node:fs';

const BUDGET_MS = 1000;
const SHOWN = 25;

const [file] = process.argv.slice(2);
const report = JSON.parse(readFileSync(file, 'utf8'));
const slow = report.testResults.flatMap((suite) =>
  suite.assertionResults
    .filter((test) => (test.duration ?? 0) > BUDGET_MS)
    .map((test) => ({
      ms: test.duration,
      file: suite.name.replace(/^.*?\/(src\/)/, '$1'),
      title: test.title,
    }))
);
slow.sort((a, b) => b.ms - a.ms);

console.log(`### Tests over ${BUDGET_MS / 1000}s: ${slow.length}`);
if (slow.length === 0) process.exit(0);
console.log('\n| Time | File | Test |\n| --- | --- | --- |');
for (const test of slow.slice(0, SHOWN))
  console.log(
    `| ${(test.ms / 1000).toFixed(1)}s | \`${test.file}\` | ${test.title.replace(/\|/g, '\\|')} |`
  );
if (slow.length > SHOWN) console.log(`\n…and ${slow.length - SHOWN} more.`);
