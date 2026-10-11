#!/usr/bin/env node
// `npm run ui:catalog [Name]`: the component catalogue as compact text.
//
// No name: every documented component with its one-line summary. With a name:
// its props, summary and story ids. Source is Storybook's components manifest
// for this worktree's code, cached by HEAD + dirty files so a repeat call is
// near-instant (see .cache/ui-catalog.json).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeMatches, findComponent, formatComponent, formatList } from './lib/uiCatalog.mjs';
import { root, withStorybook } from './lib/storybookServer.mjs';

const HELP = `Usage: npm run ui:catalog [-- <Name>]

  (no name)  list every documented component with its one-line summary
  <Name>     props (types, defaults, descriptions), summary and story ids

Reads Storybook's components manifest for this worktree's code. Starts a
short-lived Storybook itself on a free port; results are cached per commit +
dirty files. Screenshot a story: npm run ui:shot <storyId>.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}
if (args.length > 1) {
  console.error(`Expected at most one component name.\n\n${HELP}`);
  process.exit(2);
}

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'buffer', maxBuffer: 1 << 28 });

/** HEAD + every tracked/untracked change: same key means same code. */
const codeKey = () => {
  const hash = createHash('sha1').update(git('rev-parse', 'HEAD')).update(git('diff', 'HEAD'));
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z')
    .toString()
    .split('\0')
    .filter(Boolean);
  for (const file of untracked) {
    hash.update(file);
    try {
      hash.update(readFileSync(join(root, file)));
    } catch {
      // vanished mid-run
    }
  }
  return hash.digest('hex');
};

const cacheFile = join(root, '.cache', 'ui-catalog.json');

const loadManifest = async () => {
  const key = codeKey();
  try {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (cached.key === key) return cached.manifest;
  } catch {
    // no cache yet
  }
  const manifest = await withStorybook(async (base) => {
    const res = await fetch(`${base}/manifests/components.json`);
    if (!res.ok) throw new Error(`components manifest: HTTP ${res.status}`);
    return res.json();
  });
  mkdirSync(join(root, '.cache'), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify({ key, manifest }));
  return manifest;
};

try {
  const manifest = await loadManifest();
  const [name] = args;
  if (!name) {
    console.log(formatList(manifest));
  } else {
    const component = findComponent(manifest, name);
    if (!component) {
      const names = Object.values(manifest.components).map((c) => c.name);
      const near = closeMatches(name, names);
      console.error(
        `No component named "${name}".` +
          (near.length ? ` Did you mean: ${near.join(', ')}?` : ` Known: ${names.join(', ')}.`)
      );
      process.exit(1);
    }
    console.log(formatComponent(component));
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
