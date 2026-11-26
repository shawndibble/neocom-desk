#!/usr/bin/env node
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
