/**
 * D10 · V2 story hole: one Drake fit, one destination hub, from the fit to "Waypoints set".
 * Arden is docked in Yona 8 (Sinq Laison). Takes, recorded back to back on one page:
 *   D10-a  fit > Export > Appraise in Market > Compare hubs > Compare drawer "Trade hubs" (jumps from Yona)
 *   D10-b  Route Safety Yona > Dodixie: Shorter (6, lowsec, chokepoint, 3 kills) then Safer (8, all highsec)
 *   D10-c  Compare drawer again (jump counts follow Safer) > Route Safety > Set waypoints in game
 *
 *   VIDEO_OUT=/mnt/project-files/deep-dive-video/captures/D10 npx playwright test \
 *     -c scripts/dev/video/video.config.ts D10
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hideSandboxNoise, placePointer } from '../../recorder';
import { DEFAULT_OVERVIEW, openWorld } from '../world';
import { D4_LOWERED, installLoweredSkills } from '../mocks/D4-skills';
import { pasteText, runTake } from '../mocks/D4-kit';
import { D4_SETTINGS, installLpStores } from '../mocks/D4-lp';
import { installD10Danger, installHekBook, installSeyllinChokepoint, YONA, YONA_STATION } from '../mocks/D10-route';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D10';
const STOP = process.env.D10_STOP ?? 'z';
const SETTLE = 2_000;
const FIT = readFileSync(new URL('../mocks/D4-drake.eft', import.meta.url), 'utf8');
const done = (take: string) => take >= STOP;

async function settled(page: Page) {
  for (const text of [/Checking what fits/i, /Loading graphs/i, /Checking skills/i, /Working out each skill/i])
    await page.getByText(text).first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(SETTLE);
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== 'passed') await page.screenshot({ path: `${OUT}/fail.png` }).catch(() => undefined);
});

test('D10 fit to waypoints', async ({ page }) => {
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

  // a) Export > Appraise in Market > Compare hubs > the Compare drawer's Trade hubs
  await runTake(page, `${OUT}/D10-a`, async (t) => {
    t.mark('fit-open', 'The Halcyon Drake Brawl open in Fittings for Arden Kessil');
    await t.hold(3_500);
    t.mark('export-open', 'Open Export');
    await t.click(page.getByRole('button', { name: /^export/i }));
    await t.hold(3_000);
    t.mark('appraise-pick', 'Appraise in Market');
    await t.click(page.getByRole('menuitem', { name: /appraise in market/i }));
    await page.waitForURL(/appraisal/i);
    await page.getByRole('button', { name: /compare hubs/i }).first().waitFor({ timeout: 60_000 });
    await settled(page);
    t.mark('appraisal', 'The appraisal of the whole fit at the trade hub (Jita)');
    await t.hold(5_000);
    t.mark('compare-hubs-click', 'Click Compare hubs');
    await t.click(page.getByRole('button', { name: /compare hubs/i }).first());
    await settled(page);
    t.mark('compare-hubs', 'Sell total and buy total for the fit at each hub: Jita cheapest');
    await t.hold(6_000);
    for (const i of [0, 1]) {
      await page.getByText(/^add to compare$/i).first().waitFor({ state: 'detached' }).catch(() => undefined);
      await page.waitForTimeout(2_500);
      const row = page.locator('tbody tr').nth(i).getByRole('link').first();
      await row.scrollIntoViewIfNeeded();
      const box = (await row.boundingBox())!;
      await t.hoverPoint(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(400);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      await page.getByText(/^add to compare$/i).first().waitFor();
      if (i === 0) t.mark('compare-menu', 'Right-click an item: Add to Compare');
      await t.hold(2_000);
      await t.click(page.getByText(/^add to compare$/i).first());
      await page.waitForTimeout(SETTLE);
    }
    t.mark('compare-drawer', 'The Compare drawer holds the two items');
    await t.hold(3_500);
    t.mark('compare-open', 'Open the Compare drawer');
    await t.click(page.getByRole('button', { name: /^compare \(\d+\)/i }).first());
    await settled(page);
    await t.hold(3_500);
    t.mark('trade-hubs-click', 'Pick Trade hubs');
    await t.click(page.getByText(/^trade hubs$/i).first());
    await settled(page);
    t.mark('trade-hubs', 'Each hub with its jumps from Yona: Jita cheapest but 12 jumps, Dodixie 6 jumps and barely dearer');
    await t.hold(6_000);
  });
  await shot('after-a');
  if (done('b')) return;

  // b) the Drake's order book, the jump link to Dodixie, Route Safety on Shorter, then Safer
  await runTake(page, `${OUT}/D10-b`, async (t) => {
    t.mark('drake-link', 'Open the Drake from the Compare drawer: its market listing');
    await t.click(page.getByRole('link', { name: 'Drake', exact: true }).first());
    await page.getByText(/Sell orders/i).first().waitFor({ timeout: 30_000 });
    await settled(page);
    t.mark('drawer-close', 'Close the Compare drawer');
    await t.click(page.getByRole('button', { name: /clear all/i }).locator('xpath=following-sibling::button'));
    await page.waitForTimeout(SETTLE);
    t.mark('drake-market', 'The Drake order book at the trade hub (Jita, 12 jumps from Yona)');
    await t.hold(4_000);
    await t.click(page.getByRole('button', { name: /^Jita, Trade Hub/i }));
    await t.hold(1_500);
    await shot('b-hubmenu');
    await t.click(page.getByRole('group', { name: /hub/i }).getByRole('button', { name: /^Dodixie/i }));
    await page.getByText(/jumps from Yona/i).first().waitFor();
    await settled(page);
    t.mark('dodixie-market', 'The same Drake at Dodixie: 6 jumps from Yona');
    await shot('b-dodixie');
    await t.hold(4_000);
    await t.click(page.getByRole('link', { name: /jumps from Yona|open route safety/i }).first());
    await page.getByText('Gank Chokepoint').first().waitFor({ timeout: 30_000 });
    await settled(page);
    t.mark('route-shorter', 'Route Safety Yona to Dodixie on Shorter: 6 jumps, lowest 0.4, chokepoint Seyllin, 3 kills in the last hour');
    await shot('b-route');
    await t.hold(4_500);
    t.mark('chokepoint', 'Seyllin (0.4, lowsec) carries the Gank Chokepoint marker and 3 player kills in the last hour');
    await t.hover(page.getByText('Gank Chokepoint').first());
    await t.hold(4_500);
    t.mark('kills-open', 'Open the 3 player kills');
    await t.click(page.getByRole('button', { name: /3 player kills/ }).first());
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(SETTLE);
    t.mark('kills-dialog', 'The three killmails at Seyllin in the last hour');
    await shot('b-kills');
    await t.hold(5_000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE);
    t.mark('safer-click', 'Pick Safer');
    await t.click(page.getByRole('button', { name: /^Safer/ }).first());
    await page.waitForTimeout(3_000);
    t.mark('route-safer', 'Prefer safer: the route redraws, 8 jumps, lowest 0.8, all highsec, no chokepoint');
    await shot('b-safer');
    await t.hold(5_000);
  });
  if (done('c')) return;

  // c) the same hub on the market with the safer count, then Set waypoints in game
  await runTake(page, `${OUT}/D10-c`, async (t) => {
    t.mark('back-to-market', 'Back to the Drake at Dodixie');
    await page.goBack();
    await page.getByText(/jumps from Yona/i).first().waitFor();
    await settled(page);
    t.mark('market-8', 'The Dodixie order book now reads 8 jumps from Yona');
    await shot('c-market');
    await t.hold(4_500);
    t.mark('compare-open', 'Open the Compare drawer');
    await t.click(page.getByRole('button', { name: /^compare \(\d+\)/i }).first());
    await settled(page);
    const tradeHubs = page.getByText(/^trade hubs$/i).first();
    if (await tradeHubs.isVisible().catch(() => false)) await t.click(tradeHubs);
    await settled(page);
    t.mark('trade-hubs-safer', 'Every hub count follows the safer rule: Dodixie now 8 jumps');
    await shot('c-hubs');
    await t.hold(6_000);
    t.mark('route-again', 'Back to Route Safety');
    await page.goForward();
    await page.getByRole('button', { name: /Set waypoints in game/i }).waitFor();
    await settled(page);
    await shot('c-route');
    await t.hold(3_500);
    t.mark('waypoints-click', 'Set waypoints in game');
    await t.click(page.getByRole('button', { name: /Set waypoints in game/i }));
    await page.getByText(/Waypoints set/i).first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1_000);
    t.mark('waypoints-set', 'Waypoints set.');
    await shot('c-waypoints');
    await t.hold(5_000);
  });
  console.log('waypoint calls', waypointCalls.length);
  expect(waypointCalls.length).toBeGreaterThan(0);

  expect(true).toBe(true);
});
