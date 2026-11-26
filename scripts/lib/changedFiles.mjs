import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export function changedFiles(label) {
  try {
    git('rev-parse', '--verify', '--quiet', 'HEAD^2');
    return git('diff', '--name-only', '--no-renames', 'HEAD^1', 'HEAD').split('\n').filter(Boolean);
  } catch (error) {
    console.error(`${label}: could not diff against the base (${error.message.split('\n')[0]})`);
    return [];
  }
}
