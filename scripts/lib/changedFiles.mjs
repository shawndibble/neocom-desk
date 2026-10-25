import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/**
 * The files a `pull_request` run's merge commit changes against its base.
 * actions/checkout leaves HEAD at GitHub's merge commit (parent 1 = the base
 * branch tip, parent 2 = the PR head), so `HEAD^1..HEAD` is exactly what
 * merging would change. `--no-renames` lists a moved file as a delete plus an
 * add, so moving app code into docs/ still names the app path. Returns `[]`
 * when the diff cannot be taken (shallow history, no second parent, git
 * failing); callers treat that as "run everything".
 */
export function changedFiles(label) {
  try {
    git('rev-parse', '--verify', '--quiet', 'HEAD^2');
    return git('diff', '--name-only', '--no-renames', 'HEAD^1', 'HEAD').split('\n').filter(Boolean);
  } catch (error) {
    console.error(`${label}: could not diff against the base (${error.message.split('\n')[0]})`);
    return [];
  }
}
