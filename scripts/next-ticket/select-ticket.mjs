#!/usr/bin/env node
// Pick and claim the next unblocked ready-for-agent issue. Replaces the
// hand-rolled lock/list/blocked-by-check/claim sequence in next-ticket.md
// step 2 with a single call.
//
// Usage: node scripts/next-ticket/select-ticket.mjs [issue-number-override]
//
// Only picks up issues whose GitHub author is the authenticated `gh` user
// (Shawn). This guards against a repo collaborator opening an issue under
// their own account, labelling it `ready-for-agent`, and this loop
// autonomously implementing and auto-merging it — every ticket it acts on
// must actually be one Shawn (or his own automation, which authenticates as
// him) filed.
//
// Prints one line of JSON to stdout:
//   {"status":"claimed","number":83,"title":"...","slug":"item-tooltip-context-menu"}
//   {"status":"no-ticket"}
//   {"status":"lock-timeout"}
//   {"status":"override-unavailable","reason":"not-found|not-own-ticket|assigned-or-in-progress|blocked"}
// All progress chatter goes to stderr.

import fs from 'node:fs';
import path from 'node:path';
import { run, gh, ghJson, log, printResult, sleepSync } from './lib.mjs';
import { blockedByRefs } from '../lib/blockedBy.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');
const override = args[0] ? Number(args[0]) : null;

const gitCommonDir = run('git', ['rev-parse', '--git-common-dir']).trim();
const lockDir = path.join(gitCommonDir, 'next-ticket.lock');

function acquireLock() {
  let attempt = 1;
  while (attempt <= 12) {
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
        continue; // retry right away — reclaiming does not use up an attempt
      }
      log(`lock held, waiting (attempt ${attempt}/12)`);
      sleepSync(10_000);
      attempt++;
    }
  }
  return false;
}

function releaseLock() {
  try {
    fs.rmSync(lockDir, { recursive: true, force: true }); // holds an owner file, so rmdir would throw
  } catch {}
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function isUnblocked(issue) {
  if (issue.assignees && issue.assignees.length > 0) return false;
  if ((issue.labels || []).some((l) => l.name === 'in-progress')) return false;
  const refs = blockedByRefs(issue.body);
  for (const n of refs) {
    let state;
    try {
      // `gh issue view` returns empty output in the agent shell; the API is reliable.
      state = String(ghJson(['api', `repos/{owner}/{repo}/issues/${n}`]).state).toUpperCase();
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

/** Pick (and, unless a dry run, claim) under the lock. Never exits the process: the caller releases the lock. */
function selectUnderLock() {
  const currentUser = ghJson(['api', 'user']).login;
  const issues = ghJson([
    'issue',
    'list',
    '--label',
    'ready-for-agent',
    '--state',
    'open',
    '--json',
    'number,title,body,assignees,labels,author',
  ]).sort((a, b) => a.number - b.number);

  const isOwnTicket = (issue) => issue.author?.login === currentUser;

  let picked = null;
  if (override) {
    const issue = issues.find((i) => i.number === override);
    if (!issue) return { status: 'override-unavailable', reason: 'not-found' };
    if (!isOwnTicket(issue)) return { status: 'override-unavailable', reason: 'not-own-ticket' };
    if (issue.assignees?.length > 0 || issue.labels.some((l) => l.name === 'in-progress')) {
      return { status: 'override-unavailable', reason: 'assigned-or-in-progress' };
    }
    if (!isUnblocked(issue)) return { status: 'override-unavailable', reason: 'blocked' };
    picked = issue;
  } else {
    picked = issues.find((issue) => isOwnTicket(issue) && isUnblocked(issue)) ?? null;
  }

  if (!picked) return { status: 'no-ticket' };

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
  return {
    status: dryRun ? 'would-claim' : 'claimed',
    number: picked.number,
    title: picked.title,
    slug: slugify(picked.title),
  };
}

let result;
try {
  result = selectUnderLock();
} finally {
  releaseLock();
}
printResult(result);
