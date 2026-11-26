#!/usr/bin/env node

import { ghJson, tryRun, printResult, log, sleepSync, INTEGRATION_BRANCH } from './lib.mjs';

const [, , prArg] = process.argv;
if (!prArg) {
  console.error('usage: drive-ci.mjs <pr-number>');
  process.exit(2);
}

const REQUIRED_CONTEXT_POLL_ATTEMPTS = 4;
const REQUIRED_CONTEXT_POLL_INTERVAL_MS = 15_000;

const FALLBACK_REQUIRED_CONTEXTS = ['ci'];

function getRequiredContexts() {
  try {
    const rules = ghJson(['api', `repos/{owner}/{repo}/rules/branches/${INTEGRATION_BRANCH}`]);
    const contexts = rules
      .filter((r) => r.type === 'required_status_checks')
      .flatMap((r) => r.parameters?.required_status_checks ?? [])
      .map((c) => c.context)
      .filter(Boolean);
    if (contexts.length > 0) {
      return [...new Set(contexts)];
    }
    log('drive-ci: ruleset reported no required status checks, using fallback list');
  } catch (err) {
    log(
      'drive-ci: could not read branch ruleset, using fallback required contexts:',
      err.message || err
    );
  }
  return FALLBACK_REQUIRED_CONTEXTS;
}

function currentChecks(prArg) {
  try {
    return ghJson(['pr', 'checks', prArg, '--json', 'name,bucket,link']);
  } catch {
    return [];
  }
}

function failedRunIdsFrom(failed) {
  return failed.map((c) => Number((/\/runs\/(\d+)/.exec(c.link) || [])[1])).filter(Boolean);
}

function mergeState(prArg) {
  return ghJson(['pr', 'view', prArg, '--json', 'mergeStateStatus,mergeable']);
}

function isConflicting(state) {
  return state.mergeStateStatus === 'CONFLICTING' || state.mergeStateStatus === 'DIRTY';
}

function evaluateRequiredContexts(prArg, requiredContexts) {
  const checks = currentChecks(prArg);
  const presentNames = new Set(checks.map((c) => c.name));
  const failed = checks.filter((c) => c.bucket === 'fail');
  const missing = requiredContexts.filter((name) => !presentNames.has(name));
  const unfinished = checks.filter(
    (c) => requiredContexts.includes(c.name) && c.bucket !== 'pass' && c.bucket !== 'fail'
  );
  return { failed, missing, unfinished };
}

const requiredContexts = getRequiredContexts();

const state = mergeState(prArg);
if (isConflicting(state)) {
  printResult({ status: 'conflict' });
  process.exit(0);
}

tryRun('gh', ['pr', 'checks', prArg, '--watch', '--interval', '30']);

let { failed, missing, unfinished } = evaluateRequiredContexts(prArg, requiredContexts);

for (
  let attempt = 1;
  failed.length === 0 &&
  (missing.length > 0 || unfinished.length > 0) &&
  attempt < REQUIRED_CONTEXT_POLL_ATTEMPTS;
  attempt++
) {
  sleepSync(REQUIRED_CONTEXT_POLL_INTERVAL_MS);
  ({ failed, missing, unfinished } = evaluateRequiredContexts(prArg, requiredContexts));
}

if (failed.length > 0) {
  printResult({ status: 'checks-failed', failedRunIds: failedRunIdsFrom(failed) });
  process.exit(0);
}

if (missing.length > 0) {
  printResult({ status: 'missing-checks', missing });
  process.exit(0);
}

if (unfinished.length > 0) {
  printResult({ status: 'pending' });
  process.exit(0);
}

const final = mergeState(prArg);
if (isConflicting(final)) {
  printResult({ status: 'conflict' });
  process.exit(0);
}

printResult({
  status: 'green',
  mergeable: final.mergeable === 'MERGEABLE' || final.mergeable === true,
});
