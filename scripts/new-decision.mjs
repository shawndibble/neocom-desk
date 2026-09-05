#!/usr/bin/env node
// Create a new scope-decision file under docs/context/decisions/.
//
// The filename is a timestamp, never a sequence number: several /next-ticket
// agents run in parallel, and any "next number" scheme has them all claim the
// same one. See docs/context/decisions/README.md.
//
//   node scripts/new-decision.mjs "mail subject/sender search" --issue 416

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'docs/context/decisions');

const argv = process.argv.slice(2);
const issueFlag = argv.indexOf('--issue');
const issue = issueFlag >= 0 ? argv[issueFlag + 1] : null;
// Everything that is not the flag or its value is the title.
const title = argv
  .filter((a, i) => !a.startsWith('--') && !(issueFlag >= 0 && i === issueFlag + 1))
  .join(' ')
  .trim();

if (!title) {
  console.error('usage: node scripts/new-decision.mjs "<title>" [--issue <number>]');
  process.exit(1);
}

const slug = title
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .split('-')
  .slice(0, 8)
  .join('-');

const now = new Date();
const p = (n, w = 2) => String(n).padStart(w, '0');
const stamp =
  `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
  `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
const file = path.join(DIR, `${stamp}-${slug}.md`);

const body = `# Scope decisions — ${title}${issue ? ` (issue #${issue})` : ''}

_Recorded ${date}${issue ? ` · issue #${issue}` : ''}._

- **<Decision>.** <Why, and what it rules out.>
`;

writeFileSync(file, body);
console.log(path.relative(ROOT, file));
