#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { changedFiles } from './lib/changedFiles.mjs';
import { needsTests } from './lib/testRelevance.mjs';

const full = process.env.CI_FULL === 'true';
const files = full ? [] : changedFiles('needs-tests');
const run = full || needsTests(files);
console.log(
  `needs-tests: ${full ? 'full run, ' : ''}${files.length} changed files, tests ${run ? 'needed' : 'skipped'}`
);
if (!run) console.log(files.map((file) => `  ${file}`).join('\n'));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run_tests=${run}\n`);
