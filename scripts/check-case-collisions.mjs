#!/usr/bin/env node
// Fail when two tracked paths, or two same-folder names ignoring extension,
// differ only in letter case (#3890, #4579).
// Usage: node scripts/check-case-collisions.mjs
import { execFileSync } from 'node:child_process';
import { findCaseCollisions } from './lib/caseCollisions.mjs';

const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const groups = findCaseCollisions(out.split('\0').filter(Boolean));
if (groups.length) {
  console.error('Case-only path or name collisions (break macOS/Windows checkouts):');
  for (const g of groups) console.error(`  ${g.join('  <->  ')}`);
  process.exit(1);
}
