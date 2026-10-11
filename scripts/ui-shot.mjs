#!/usr/bin/env node
// `npm run ui:shot <storyId> [--widths 1440,390] [--out <dir>]`: PNG of a story.
//
// Starts (or reuses) this worktree's Storybook, screenshots the story at each
// width with Playwright, prints the PNG paths, and shuts down what it started.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { root, withStorybook } from './lib/storybookServer.mjs';

const HELP = `Usage: npm run ui:shot -- <storyId> [--widths 1440,390] [--out <dir>]

  <storyId>   e.g. ui-button--primary (ids are listed by: npm run ui:catalog <Name>)
  --widths    comma-separated viewport widths in px (default 1440,390)
  --out       output directory (default .cache/ui-shot)

Writes <storyId>-<width>.png per width and prints each path.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

const fail = (msg) => {
  console.error(`${msg}\n\n${HELP}`);
  process.exit(2);
};

let storyId;
let widths = [1440, 390];
let out = join(root, '.cache', 'ui-shot');
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--widths') {
    widths = (args[++i] ?? '').split(',').map(Number);
    if (!widths.length || widths.some((w) => !Number.isInteger(w) || w < 100 || w > 4000))
      fail('--widths needs comma-separated integers, e.g. 1440,390');
  } else if (a === '--out') {
    if (!args[++i]) fail('--out needs a directory');
    out = resolve(args[i]);
  } else if (a.startsWith('-') || storyId) fail(`Unexpected argument: ${a}`);
  else storyId = a;
}
if (!storyId) fail('Missing <storyId>.');

try {
  const paths = await withStorybook(async (base) => {
    const index = await (await fetch(`${base}/index.json`)).json();
    const stories = Object.values(index.entries).filter((e) => e.type === 'story');
    if (!stories.some((s) => s.id === storyId)) {
      const near = stories
        .map((s) => s.id)
        .filter((id) => id.split('--')[0] === storyId.split('--')[0]);
      throw Object.assign(
        new Error(
          `Unknown story id "${storyId}". ` +
            (near.length
              ? `Same component: ${near.join(', ')}.`
              : 'List ids: npm run ui:catalog <Name>.')
        )
      );
    }
    mkdirSync(out, { recursive: true });
    const browser = await chromium.launch();
    try {
      const done = [];
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.goto(`${base}/iframe.html?id=${storyId}&viewMode=story`, {
          waitUntil: 'networkidle',
        });
        await page.waitForSelector('#storybook-root > *, #root > *', { timeout: 15_000 });
        const file = join(out, `${storyId}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        await page.close();
        done.push(file);
      }
      return done;
    } finally {
      await browser.close();
    }
  });
  console.log(paths.join('\n'));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(err?.code === 1 ? 1 : 1);
}
