#!/usr/bin/env node

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
      `e2e job failed (${failedJobNames.join(', ')}) — consider: gh run download ${runId} -p 'playwright-report-shard-*'`
    );
  }
} catch {}
