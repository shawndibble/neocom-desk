#!/usr/bin/env node
// Merge (merge commit, not squash), verify the issue closed, and tear down
// the worktree.
// Replaces next-ticket.md step 9's sequence of separate `gh`/`git` calls.
//
// Usage: node scripts/next-ticket/finish.mjs <pr-number> <issue-number> <worktree-path>
// Must be run from the main checkout (not the worktree being removed).
//
// Prints one line of JSON to stdout:
//   {"status":"merged","issueClosed":true}
//   {"status":"merged","issueClosed":false}   (PR body has no "Closes #n")
//   {"status":"merge-failed","message":"..."}

import { run, gh, ghJson, tryRun, printResult, sleepSync } from './lib.mjs';

const [, , prArg, issueArg, worktreePath] = process.argv;
if (!prArg || !issueArg || !worktreePath) {
  console.error('usage: finish.mjs <pr-number> <issue-number> <worktree-path>');
  process.exit(2);
}

// `--merge`, not `--squash`, for the same reason open-pr.mjs arms auto-merge
// that way: a squash rewrites this branch's commits and breaks any PR stacked
// on it. Keep the two in sync — a mismatch here would merge some PRs one way
// and some the other depending on which path won the race.
const merge = tryRun('gh', ['pr', 'merge', prArg, '--merge', '--delete-branch']);
if (!merge.ok) {
  // open-pr.mjs arms auto-merge on this PR; it may have already merged
  // (e.g. while drive-ci.mjs's watch was still running or had errored),
  // which makes this direct merge attempt fail even though the PR is done.
  const state = ghJson(['pr', 'view', prArg, '--json', 'state']).state;
  if (state !== 'MERGED') {
    printResult({ status: 'merge-failed', message: merge.stderr.trim() });
    process.exit(1);
  }
}

// Only a closing keyword in the PR body ("Closes #n") should close the issue.
// A "Part of #n" PR leaves a partly-done ticket open for the next run.
const prBody = ghJson(['pr', 'view', prArg, '--json', 'body']).body ?? '';
const closesIssue = new RegExp(
  `\\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\\s*:?\\s+#${issueArg}\\b`,
  'i'
).test(prBody);

let issueClosed = false;
if (closesIssue) {
  for (let i = 0; i < 5; i++) {
    const state = ghJson(['issue', 'view', issueArg, '--json', 'state']).state;
    if (state === 'CLOSED') {
      issueClosed = true;
      break;
    }
    sleepSync(2000);
  }

  if (!issueClosed) {
    const prUrl = ghJson(['pr', 'view', prArg, '--json', 'url']).url;
    gh(['issue', 'close', issueArg, '--comment', `Merged in ${prUrl}`]);
    issueClosed = true;
  }
} else {
  // Partial work: the issue stays open, unclaimed, for the next run.
  const state = ghJson(['issue', 'view', issueArg, '--json', 'state']).state;
  if (state === 'CLOSED') gh(['issue', 'reopen', issueArg]);
  const login = tryRun('gh', ['api', 'user', '-q', '.login']);
  if (login.ok) tryRun('gh', ['issue', 'edit', issueArg, '--remove-assignee', login.stdout.trim()]);
}

tryRun('gh', ['issue', 'edit', issueArg, '--remove-label', 'in-progress']);

tryRun('git', ['worktree', 'remove', worktreePath, '--force']);
run('git', ['worktree', 'prune']);

printResult({ status: 'merged', issueClosed });
