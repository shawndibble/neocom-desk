#!/usr/bin/env node
// One round of next-ticket.md step 8: check mergeability, then block on
// CI. Combines the two separate `gh` calls the skill used to make (and
// the merge-state poll) into one. The agent still owns what happens on
// a non-green result — conflict resolution, fix-and-push, re-invoke —
// this script just reports where things stand.
//
// An absent signal is not a negative signal: `gh pr checks --watch` only
// blocks on checks that actually exist. If a required context (e.g.
// `validate` or `e2e`) never gets a check run at all — the workflow didn't
// trigger, a path filter skipped it, whatever — `--watch` sees nothing to
// wait for and exits clean, and naively reporting "green" whenever nothing
// is failing would call that PR mergeable when branch protection would
// still reject it. Same failure mode, one state over: a required context
// that's present but still mid-run (e.g. `--watch` itself got interrupted
// before it settled) isn't in the `fail` bucket and isn't "missing" either,
// so it has to be checked for explicitly too. So after checks settle, this
// script separately asserts that every context the branch ruleset actually
// requires (a) showed up at all and (b) actually passed, and reports a
// distinct status for each way that can fail — never folding "never ran"
// or "still running" into "failed" (there's nothing to diagnose) or into
// "green" (see #317).
//
// A required context that's simply absent gets a short bounded grace
// period (see REQUIRED_CONTEXT_POLL_*) before being called `missing-checks`
// — right after a push, GitHub can take a few seconds to register a
// workflow run, and that registration lag looks identical to "never
// running" on the first poll. Genuine absence (a workflow that truly never
// triggers) still gets caught: this grace period is much shorter than the
// outer round-to-round retry in next-ticket.md step 8, which keeps calling
// this script again as long as the ticket loop is retrying.
//
// Usage: node scripts/next-ticket/drive-ci.mjs <pr-number>
//
// Prints one line of JSON to stdout:
//   {"status":"conflict"}                                     — run sync-main.mjs, then retry
//   {"status":"green","mergeable":true}                       — proceed to finish.mjs
//   {"status":"checks-failed","failedRunIds":[123456]}         — diagnose, fix, retry
//   {"status":"missing-checks","missing":["validate","e2e"]}   — required context(s) never
//                                                                 reported at all; wait and retry
//   {"status":"pending"}                                       — a required context is still
//                                                                 running, or hasn't registered
//                                                                 yet within the grace period;
//                                                                 wait and retry

import { ghJson, tryRun, printResult, log } from './lib.mjs';

const [, , prArg] = process.argv;
if (!prArg) {
  console.error('usage: drive-ci.mjs <pr-number>');
  process.exit(2);
}

// How long to wait, in short bursts, for a required context that appears
// absent or unfinished to resolve on its own before reporting it out. Total
// worst case ~45s — small next to the CI runtime `--watch` already blocked
// on, but enough to absorb normal registration/settling lag.
const REQUIRED_CONTEXT_POLL_ATTEMPTS = 4;
const REQUIRED_CONTEXT_POLL_INTERVAL_MS = 15_000;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Fallback only — used if the ruleset API call below fails (permissions,
// API shape change, etc.). The real source of truth is the "Merging"
// branch ruleset covering `main` in this repo; keep this in sync with it
// if that ruleset's required contexts ever change.
const FALLBACK_REQUIRED_CONTEXTS = ['validate', 'e2e'];

function getRequiredContexts() {
  try {
    const rules = ghJson(['api', 'repos/{owner}/{repo}/rules/branches/main']);
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
    // "no checks reported" exits non-zero — treat as an empty check list
    // rather than an error; the missing-context comparison below is what
    // actually reports this state.
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

// One snapshot of where the required contexts stand: genuinely failed,
// entirely absent, or present but not (yet) a `pass`.
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

// Block until whatever checks currently exist settle. Its exit code alone
// is not trusted below — a clean exit here only means nothing *present*
// failed, not that every required context showed up and passed (see
// header comment).
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
