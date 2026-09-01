#!/usr/bin/env node
// Fetch and lightly filter a failed CI run's log so the diagnosis
// sub-agent (next-ticket.md step 8) gets one call instead of the
// `gh run view --log-failed` (+ `gh run download` for e2e) sequence.
//
// Usage: node scripts/next-ticket/fetch-ci-failure.mjs <run-id>
//
// Prints the filtered failed-step log to stdout (plain text, not JSON —
// this is read by an agent, not parsed by another script).

import { gh } from './lib.mjs';

const [, , runId] = process.argv;
if (!runId) {
  console.error('usage: fetch-ci-failure.mjs <run-id>');
  process.exit(2);
}

const log = gh(['run', 'view', runId, '--log-failed']);
const MAX_CHARS = 20_000;
console.log(log.length > MAX_CHARS ? log.slice(-MAX_CHARS) : log);

try {
  const jobs = JSON.parse(gh(['run', 'view', runId, '--json', 'jobs']));
  const failedJobNames = (jobs.jobs || [])
    .filter((j) => j.conclusion === 'failure')
    .map((j) => j.name);
  if (failedJobNames.some((n) => /e2e/i.test(n))) {
    console.error(
      `e2e job failed (${failedJobNames.join(', ')}) — consider: gh run download ${runId} -n playwright-report`
    );
  }
} catch {}
