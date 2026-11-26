/**
 * Smoke test for the deep-dive world: opens the pages the first capture specs lean on and saves
 * a PNG of each, so a human (or agent) can check the cast, the three characters and the data.
 *
 *   VIDEO_OUT=/mnt/project-files/deep-dive-video/captures/world-smoke \
 *     npx playwright test -c scripts/dev/video/video.config.ts world-smoke
 */
import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { hideSandboxNoise } from '../recorder';
import { openWorld, type WorldOptions } from './world';

const OUT = process.env.VIDEO_OUT ?? 'test-results/world-smoke';
mkdirSync(OUT, { recursive: true });

const PAGES: { name: string; path: string; ready: RegExp; options?: WorldOptions }[] = [
  { name: 'characters', path: './characters', ready: /Mira Voskane/ },
  { name: 'overview', path: './overview', ready: /Arden Kessil/ },
  { name: 'market-orders', path: './market/orders', ready: /Drake/ },
  { name: 'wallet-journal', path: './wallet/journal', ready: /Bounty|bounty/ },
  { name: 'wallet-transactions', path: './wallet/transactions', ready: /Tritanium|Drake/ },
  { name: 'assets', path: './assets', ready: /Nourvukaiken/ },
  { name: 'assets-ships', path: './assets/ships', ready: /Gila/ },
  { name: 'skills', path: './skills', ready: /Skill/ },
];

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

for (const entry of PAGES) {
  test(`world: ${entry.name}`, async ({ page }) => {
    await hideSandboxNoise(page);
    await openWorld(page, entry.path, entry.options);
    await page.getByText(entry.ready).first().waitFor({ timeout: 40_000 });
    await shoot(page, entry.name);
  });
}
