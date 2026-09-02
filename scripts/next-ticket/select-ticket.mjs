#!/usr/bin/env node
// Pick and claim the next unblocked ready-for-agent issue. Replaces the
// hand-rolled lock/list/blocked-by-check/claim sequence in next-ticket.md
// step 2 with a single call.
//
// Usage: node scripts/next-ticket/select-ticket.mjs [issue-number-override]
//
// Prints one line of JSON to stdout:
//   {"status":"claimed","number":83,"title":"...","slug":"item-tooltip-context-menu"}
//   {"status":"no-ticket"}
//   {"status":"lock-timeout"}
//   {"status":"override-unavailable","reason":"assigned|in-progress|blocked|not-found"}
// All progress chatter goes to stderr.

import fs from 'node:fs';
import path from 'node:path';
import { run, gh, ghJson, log, printResult } from './lib.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');
const override = args[0] ? Number(args[0]) : null;

const gitCommonDir = run('git', ['rev-parse', '--git-common-dir']).trim();
const lockDir = path.join(gitCommonDir, 'next-ticket.lock');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock() {
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(path.join(lockDir, 'owner'), String(Math.floor(Date.now() / 1000)));
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let ownerTs = 0;
      try {
        ownerTs = Number(fs.readFileSync(path.join(lockDir, 'owner'), 'utf8').trim());
      } catch {}
      const ageSec = Math.floor(Date.now() / 1000) - ownerTs;
      if (ageSec > 90) {
        log(`stale lock (${ageSec}s old), reclaiming`);
        fs.rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      log(`lock held, waiting (attempt ${attempt}/12)`);
      sleep(10_000);
    }
  }
  return false;
}

function releaseLock() {
  try {
    fs.rmdirSync(lockDir);
  } catch {}
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function blockedByRefs(body) {
  const m = /## Blocked by\s*\n([\s\S]*?)(\n## |$)/i.exec(body || '');
  if (!m) return [];
  const section = m[1].trim();
  if (!section || /^none\b/i.test(section)) return [];
  return [...section.matchAll(/#(\d+)/g)].map((mm) => Number(mm[1]));
}

function isUnblocked(issue) {
  if (issue.assignees && issue.assignees.length > 0) return false;
  if ((issue.labels || []).some((l) => l.name === 'in-progress')) return false;
  const refs = blockedByRefs(issue.body);
  for (const n of refs) {
    let state;
    try {
      state = ghJson(['issue', 'view', String(n), '--json', 'state']).state;
    } catch {
      return false; // can't confirm closed — treat as still blocked
    }
    if (state !== 'CLOSED') return false;
  }
  return true;
}

if (!acquireLock()) {
  printResult({ status: 'lock-timeout' });
  process.exit(0);
}

let picked = null;
try {
  const issues = ghJson([
    'issue',
    'list',
    '--label',
    'ready-for-agent',
    '--state',
    'open',
    '--json',
    'number,title,body,assignees,labels',
  ]).sort((a, b) => a.number - b.number);

  if (override) {
    const issue = issues.find((i) => i.number === override);
    if (!issue) {
      printResult({ status: 'override-unavailable', reason: 'not-found' });
      process.exit(0);
    }
    if (issue.assignees?.length > 0 || issue.labels.some((l) => l.name === 'in-progress')) {
      printResult({ status: 'override-unavailable', reason: 'assigned-or-in-progress' });
      process.exit(0);
    }
    if (!isUnblocked(issue)) {
      printResult({ status: 'override-unavailable', reason: 'blocked' });
      process.exit(0);
    }
    picked = issue;
  } else {
    for (const issue of issues) {
      if (isUnblocked(issue)) {
        picked = issue;
        break;
      }
    }
  }

  if (!picked) {
    printResult({ status: 'no-ticket' });
    process.exit(0);
  }

  if (!dryRun) {
    gh([
      'issue',
      'edit',
      String(picked.number),
      '--add-assignee',
      '@me',
      '--add-label',
      'in-progress',
    ]);
  } else {
    log(`dry-run: would claim #${picked.number}`);
  }
} finally {
  releaseLock();
}

printResult({
  status: dryRun ? 'would-claim' : 'claimed',
  number: picked.number,
  title: picked.title,
  slug: slugify(picked.title),
});
