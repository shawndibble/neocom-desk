#!/usr/bin/env node

import { run, gh, ghJson, tryRun, printResult, sleepSync } from './lib.mjs';

const [, , prArg, issueArg, worktreePath] = process.argv;
if (!prArg || !issueArg || !worktreePath) {
  console.error('usage: finish.mjs <pr-number> <issue-number> <worktree-path>');
  process.exit(2);
}

const merge = tryRun('gh', ['pr', 'merge', prArg, '--merge', '--delete-branch']);
if (!merge.ok) {
  const state = ghJson(['pr', 'view', prArg, '--json', 'state']).state;
  if (state !== 'MERGED') {
    printResult({ status: 'merge-failed', message: merge.stderr.trim() });
    process.exit(1);
  }
}

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
  const state = ghJson(['issue', 'view', issueArg, '--json', 'state']).state;
  if (state === 'CLOSED') gh(['issue', 'reopen', issueArg]);
  const login = tryRun('gh', ['api', 'user', '-q', '.login']);
  if (login.ok) tryRun('gh', ['issue', 'edit', issueArg, '--remove-assignee', login.stdout.trim()]);
}

tryRun('gh', ['issue', 'edit', issueArg, '--remove-label', 'in-progress']);

tryRun('git', ['worktree', 'remove', worktreePath, '--force']);
run('git', ['worktree', 'prune']);

printResult({ status: 'merged', issueClosed });
