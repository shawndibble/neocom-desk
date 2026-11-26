/**
 * D11 · V2 "what does this cost": the fit's Price section at Arden's hub, then Export > Appraise in
 * Market, then the appraisal table's column picker (hide a few columns). One continuous take, same
 * world as D10 (Arden docked in Yona, Halcyon Drake Brawl).
 *
 *   VIDEO_OUT=/mnt/project-files/deep-dive-video/captures/D11 npx playwright test \
 *     -c scripts/dev/video/video.config.ts D11
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hideSandboxNoise, placePointer } from '../../recorder';
import { DEFAULT_OVERVIEW, openWorld } from '../world';
import { D4_LOWERED, installLoweredSkills } from '../mocks/D4-skills';
import { pasteText, runTake } from '../mocks/D4-kit';
import { D4_SETTINGS, installLpStores } from '../mocks/D4-lp';
import { installD10Danger, installHekBook, installSeyllinChokepoint, YONA, YONA_STATION } from '../mocks/D10-route';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D11';
const SETTLE = 2_000;
const FIT = readFileSync(new URL('../mocks/D4-drake.eft', import.meta.url), 'utf8');
const HIDE = (process.env.D11_HIDE ?? 'Refine total,Refine + ore,LP store,Volume (m³)').split(',');

async function settled(page: Page) {
  for (const text of [/Checking what fits/i, /Loading graphs/i, /Checking skills/i, /Working out each skill/i])
    await page.getByText(text).first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(SETTLE);
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== 'passed') await page.screenshot({ path: `${OUT}/fail.png` }).catch(() => undefined);
});

test('D11 price and appraisal', async ({ page }) => {
  test.setTimeout(0);
  const waypointCalls: string[] = [];
  await hideSandboxNoise(page);
  await openWorld(page, './overview', {
    warm: false,
    systemId: YONA,
    stationId: YONA_STATION,
    overview: DEFAULT_OVERVIEW.filter((w) => w.kind !== 'netWorth'),
    // Prefer shorter is the Travel Setting the story starts on; the Compare drawer counts follow it.
    settings: [...D4_SETTINGS, { key: 'sync.routePreference', value: 'shortest' }],
    before: async (p) => {
      await installLoweredSkills(p, D4_LOWERED);
      await installLpStores(p);
      await installD10Danger(p, waypointCalls);
      await installSeyllinChokepoint(p);
      await installHekBook(p);
    },
  });
  await page.getByText('Arden Kessil').first().waitFor();
  await page.waitForTimeout(6_000);
  await placePointer(page, 1000, 520);
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  // Before recording: paste the fit and take the recommended CPU swap, so the fit opens inside its budget.
  await pasteText(page, FIT);
  await page.getByText('Over by').first().waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByText('Fix CPU', { exact: true }).first().click();
  await page.getByText(/Checking implants/i).waitFor({ state: 'detached', timeout: 60_000 }).catch(() => undefined);
  await settled(page);
  await page.getByText('Caldari Navy Multispectrum Shield Hardener').first().click();
  await page.waitForTimeout(8_000);
  await shot('prep-fit');
  await placePointer(page, 1000, 520);


  // Warm the appraisal route once (fit > Export > Appraise), come back, so the take shows no spinner.
  await page.getByRole('button', { name: /^export/i }).click();
  await page.getByRole('menuitem', { name: /appraise in market/i }).click();
  await page.waitForURL(/appraisal/i);
  await page.getByRole('button', { name: /compare hubs/i }).first().waitFor({ timeout: 60_000 });
  await settled(page);
  await page.goBack();
  await page.getByText('Damage & Tank').first().waitFor({ timeout: 30_000 });
  await settled(page);
  // Price section open before the take (it remembers), stats column back at the top.
  const priceBtn = page.locator('button[aria-expanded]').filter({ hasText: /^Price/ }).first();
  await priceBtn.scrollIntoViewIfNeeded();
  if ((await priceBtn.getAttribute('aria-expanded')) !== 'true') await priceBtn.click();
  await page.waitForTimeout(SETTLE);
  await shot('prep-price');
  await page.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }));
  window_scroll: await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(SETTLE);
  await placePointer(page, 1000, 520);

  await runTake(page, `${OUT}`, async (t) => {
    t.mark('fit-open', 'The Halcyon Drake Brawl open in Fittings, cursor at rest');
    await t.hold(3_500);
    const stats = (await page.getByText('Damage & Tank').first().boundingBox())!;
    t.mark('scroll-to-price', 'Scroll the stats column down to Price');
    await t.hoverPoint(stats.x + 120, stats.y + 300);
    await t.scroll(2_400);
    await t.scroll(600);
    await t.hold(1_000);
    await shot('price-view');
    t.mark('price-value', 'The whole fit priced at the trade hub');
    await t.hover(page.getByText('Priced at').first());
    await t.hold(4_000);
    t.mark('export-open', 'Open Export');
    await t.click(page.getByRole('button', { name: /^export/i }));
    await t.hold(2_500);
    t.mark('appraise-pick', 'Appraise in Market');
    await t.click(page.getByRole('menuitem', { name: /appraise in market/i }));
    await page.waitForURL(/appraisal/i);
    await page.getByRole('button', { name: /compare hubs/i }).first().waitFor({ timeout: 60_000 });
    await settled(page);
    t.mark('appraisal', 'Market > Appraisal: the full table');
    await t.hold(3_500);
    t.mark('columns-open', 'Open the column picker');
    await t.click(page.getByRole('button', { name: /^columns$/i }).first());
    await page.getByRole('menu').waitFor();
    await shot('picker');
    await t.hold(2_500);
    for (const name of HIDE) {
      t.mark(`hide-${name}`, `Untick ${name}`);
      await t.click(page.getByRole('menuitemcheckbox', { name: new RegExp('^' + name.replace(/[()+³]/g, '\\$&') + '$', 'i') }).first());
      await t.hold(1_200);
    }
    t.mark('picker-close', 'Close the picker');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE);
    await t.hoverPoint(720, 420);
    t.mark('slim-table', 'The slimmer table');
    await shot('slim');
    await t.hold(4_000);
  });
});
