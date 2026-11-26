/**
 * V1 reshoot, chapters ch05 (Fit), ch06 (Parts), ch07 (Route). One take per chapter, recorded back to
 * back on the same page; each take starts with the cursor where the last one stopped.
 *
 *   VIDEO_OUT=/mnt/project-files/deep-dive-video/captures/V1R npx playwright test \
 *     -c scripts/dev/video/video.config.ts V1R-ch05-07
 * V1R_ONLY=ch05|ch06|ch07 stops after that chapter (V1R_STOP).
 */
import { test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hideSandboxNoise, placePointer } from '../../recorder';
import { DEFAULT_OVERVIEW, openWorld } from '../world';
import { D4_LOWERED, installLoweredSkills } from '../mocks/D4-skills';
import { pasteText, runTake } from '../mocks/D4-kit';
import { D4_SETTINGS, installLpStores } from '../mocks/D4-lp';
import { installV1rDanger, installV1rMarket } from '../mocks/V1R-route';
import { installD9 } from '../mocks/D9-ore';

const OUT = process.env.VIDEO_OUT ?? 'test-results/V1R';
const STOP = process.env.V1R_STOP ?? 'ch99';
const FIT = readFileSync(new URL('../mocks/D4-drake.eft', import.meta.url), 'utf8');
const SETTLE = 2_000;
const AIM = 400;
const waypoints: string[] = [];

async function settled(page: Page) {
  for (const text of [/Checking what fits/i, /Loading graphs/i, /Checking skills/i, /Working out each skill/i, /Checking implants/i])
    await page.getByText(text).first().waitFor({ state: 'detached', timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(SETTLE);
}

/**
 * Runs the fit's slow steps (Fix CPU, the skills list, the Improve search) once before recording, in
 * the same page, so the recorded take never sits on a "Checking ..." line. Ends on the Overview.
 */
async function warmFit(page: Page) {
  await pasteText(page, FIT);
  await page.getByText('Over by').first().waitFor({ timeout: 30_000 });
  await settled(page);
  await page.getByText('Fix CPU', { exact: true }).first().click();
  await settled(page);
  await page.getByText('Caldari Navy Multispectrum Shield Hardener').first().click({ timeout: 60_000 });
  await settled(page);
  await page.getByRole('button', { name: /^pilot/i }).first().click();
  await page.getByText('Improves fit', { exact: false }).first().waitFor();
  await settled(page);
  await page.getByRole('button', { name: /close/i }).first().click();
  await page.waitForTimeout(SETTLE);
  await page.getByRole('button', { name: /^(improve|fix fit)/i }).first().click();
  await page.getByRole('button', { name: /more damage/i }).click();
  await page.getByText(/Checked \d+ swaps/i).waitFor({ timeout: 90_000 });
  await settled(page);
  await page.getByRole('button', { name: /close/i }).first().click();
  await page.waitForTimeout(SETTLE);
  await page.getByRole('navigation').getByRole('link', { name: 'Overview', exact: true }).first().click();
  await page.getByText('Arden Kessil').first().waitFor();
  await page.waitForTimeout(4_000);
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== 'passed') await page.screenshot({ path: `${OUT}/fail-ch05-07.png` }).catch(() => undefined);
});

test('V1R ch05-07', async ({ page }) => {
  test.setTimeout(0);
  page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
  await hideSandboxNoise(page);
  await openWorld(page, './overview', {
    warm: false,
    overview: DEFAULT_OVERVIEW.filter((w) => w.kind !== 'netWorth'),
    settings: [...D4_SETTINGS, { key: 'sync.routePreference', value: 'shortest' }],
    before: async (p) => {
      await installLoweredSkills(p, D4_LOWERED);
      await installLpStores(p);
      await installV1rDanger(p, waypoints);
      await installV1rMarket(p);
      await installD9(p);
    },
  });
  await page.getByText('Arden Kessil').first().waitFor();
  await page.waitForTimeout(6_000);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await placePointer(page, 1000, 520);
  await warmFit(page);
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

  // ---------------------------------------------------------------- ch05 Fit
  await runTake(page, `${OUT}/ch05`, async (t) => {
    t.mark('overview', 'Overview before the paste');
    await t.hold(3_000);
    t.mark('paste-fit', 'EFT text pasted on the Overview (Ctrl+V)');
    await pasteText(page, FIT);
    await page.getByText('Over by').first().waitFor({ timeout: 30_000 });
    await settled(page);
    t.mark('fit-lands', 'Fittings opens with the Halcyon Drake Brawl');
    await t.hold(4_000);
    t.mark('cpu-over', 'CPU 629 / 600, over by 29');
    await t.hover(page.getByText('Over by').first());
    await t.hold(4_000);
    t.mark('fix-fit-click', 'Click Fix CPU under the over-budget CPU bar');
    await t.click(page.getByText('Fix CPU', { exact: true }).first());
    await page.getByText('Caldari Navy Multispectrum Shield Hardener').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(SETTLE);
    t.mark('make-it-fit', 'Make it fit: 29 tf over budget, three ways out (the implants list is still loading in the corner for ~10 s)');
    await t.hold(3_500);
    t.mark('way-swap', 'Swap modules: each frees CPU and saves ISK');
    await t.hover(page.getByText('SWAP MODULES', { exact: false }).first());
    await t.hold(4_000);
    t.mark('way-train', 'Train: Weapon Upgrades V and CPU Management V, 13d 4h');
    await t.hover(page.getByText('Weapon Upgrades', { exact: false }).first());
    await t.hold(3_500);
    await settled(page);
    t.mark('way-implant', 'Implants: what each adds and costs');
    await t.hover(page.getByText("Zainou 'Gypsy' CPU Management EE-606").first());
    await t.hold(4_000);
    t.mark('swap-pick', 'Pick the recommended module swap');
    await t.click(page.getByText('Caldari Navy Multispectrum Shield Hardener').first());
    await page.waitForTimeout(SETTLE);
    t.mark('swap-applied', 'Applied: CPU 594 / 600, the fit now fits');
    await t.hold(4_500);
    t.mark('pilot-open', 'Open the Pilot drawer');
    await t.click(page.getByRole('button', { name: /^pilot/i }).first());
    await page.getByText('Improves fit', { exact: false }).first().waitFor();
    await settled(page);
    t.mark('what-to-train', 'What to train: skills ranked by Improves fit');
    await t.hold(5_000);
    t.mark('add-to-plan', 'Add the top ranked skill (Heavy Missiles V) to the plan');
    await t.click(page.getByRole('button', { name: /^Add to plan:/ }).nth(1));
    await page.getByText('Undo', { exact: true }).waitFor();
    await page.waitForTimeout(SETTLE);
    t.mark('plan-toast', 'Toast: added to the plan, with Undo');
    await t.hover(page.getByText('Undo', { exact: true }));
    await t.hold(4_500);
    t.mark('pilot-close', 'Close the Pilot drawer');
    await t.click(page.getByRole('button', { name: /close/i }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('improve-open', 'Open Improve');
    await t.click(page.getByRole('button', { name: /^(improve|fix fit)/i }).first());
    await page.getByRole('button', { name: /more damage/i }).waitFor();
    await settled(page);
    await t.hold(3_000);
    t.mark('goal-pick', 'Pick the goal More damage');
    await t.click(page.getByRole('button', { name: /more damage/i }));
    await page.getByText(/Checked \d+ swaps/i).waitFor({ timeout: 90_000 });
    await settled(page);
    t.mark('goal-more-damage', 'More damage: ranked changes');
    await t.hold(4_000);
    t.mark('settings-open', 'Open Search settings');
    await t.click(page.getByText('Search settings', { exact: false }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('budget-click', 'Click Total budget (ISK)');
    const budget = page.getByLabel(/Total budget/i);
    await t.click(budget);
    t.mark('budget-type', 'Type 150m, one character at a time');
    await page.keyboard.type('150m', { delay: 90 });
    await page.getByText(/Checked \d+ swaps/i).waitFor({ timeout: 90_000 });
    await settled(page);
    t.mark('budget-set', 'Budget 150,000,000: the changes stay under it');
    await t.hold(4_500);
    t.mark('settings-close', 'Collapse Search settings');
    await t.click(page.getByText('Search settings', { exact: false }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('ranked-changes', 'The ranked list of changes');
    await t.hold(3_500);
    const row = page.getByText(/True Sansha Heavy Missile Launcher/).first();
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(SETTLE);
    const rowBox = (await row.boundingBox())!;
    t.mark('hover-preview', 'Hover one suggestion: every stat before and after (offense column shows 218.1 to 250.5)');
    await t.hoverPoint(rowBox.x + 120, rowBox.y + rowBox.height + 25);
    await t.hold(5_500);
  });
  await shot('after-ch05');
  if (STOP <= 'ch05') return;

  // ---------------------------------------------------------------- ch06 Parts
  await runTake(page, `${OUT}/ch06`, async (t) => {
    t.mark('improve-close', 'Close the Improve panel; back on the fit');
    await t.click(page.getByRole('button', { name: /close/i }).first());
    await page.waitForTimeout(SETTLE);
    await t.hold(2_000);
    const stats = (await page.getByText('Damage & Tank').first().boundingBox())!;
    t.mark('scroll-to-price', 'Scroll the stats column down to the Price section');
    await t.hoverPoint(stats.x + 120, stats.y + 300);
    await t.scroll(2_400);
    await t.hold(1_500);
    t.mark('price-open', 'Open the Price section at the bottom of the stats column (54.8M ISK)');
    await t.click(page.locator('button[aria-expanded]').filter({ hasText: /^Price/ }).first());
    await page.waitForTimeout(SETTLE);
    await t.scroll(600);
    await t.hold(1_000);
    t.mark('price-section', 'Price section: Priced at Jita, Appraise');
    await t.hover(page.getByText('Priced at').first());
    await t.hold(3_500);
    t.mark('hub-open', 'Open the hub picker');
    await t.click(page.getByText('Priced at').locator('..').getByRole('button').first());
    await page.getByText('Market hub settings', { exact: false }).first().waitFor();
    await t.hold(3_000);
    t.mark('hub-pick', 'Pick Jita 4-4');
    await t.click(page.getByRole('button', { name: /^Jita 4-4/ }).first());
    await t.hold(2_000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE);
    t.mark('appraise-click', 'Click Appraise');
    await t.click(page.getByRole('button', { name: /^Appraise$/ }));
    await page.getByRole('dialog').getByText('Total', { exact: true }).first().waitFor();
    await page.waitForTimeout(SETTLE);
    t.mark('appraisal', 'Price breakdown: every item priced at Jita, total 54.8M ISK');
    await t.hold(5_000);
    t.mark('copy-multibuy', 'Copy to multibuy: the list for the game');
    await t.click(page.getByRole('dialog').getByRole('button', { name: /Copy to multibuy/ }));
    await page.getByRole('dialog').getByText(/Multibuy list copied/).waitFor();
    await t.hold(2_000);
    await t.hold(2_500);
    t.mark('appraisal-close', 'Close the breakdown');
    await t.click(page.getByRole('dialog').getByRole('button', { name: /close/i }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('export-open', 'Open Export');
    await t.click(page.getByRole('button', { name: /^export/i }));
    await page.getByRole('menuitem', { name: /minus owned/i }).waitFor();
    await t.hold(2_500);
    t.mark('multibuy-item', 'Copy multibuy list');
    await t.hover(page.getByRole('menuitem', { name: /^Copy multibuy list$/ }));
    await t.hold(1_500);
    t.mark('minus-owned', 'Click Copy multibuy list, minus owned');
    await t.click(page.getByRole('menuitem', { name: /minus owned/i }));
    await page.getByText(/Multibuy list copied, minus/i).first().waitFor();
    t.mark('minus-owned-toast', 'Multibuy list copied, minus what Arden holds in Jita (toast lasts 2.5 s)');
    await t.hover(page.getByText(/Multibuy list copied, minus/i).first());
    await t.hold(2_000);
    await t.hold(2_500);
    t.mark('lookup-open', 'Open the breakdown again to look up the missing module');
    await t.click(page.getByRole('button', { name: /^Appraise$/ }));
    await page.getByRole('dialog').getByText('Total', { exact: true }).first().waitFor();
    await page.waitForTimeout(SETTLE);
    t.mark('module-link', 'Click the Caldari Navy Multispectrum Shield Hardener');
    await t.click(page.getByRole('dialog').getByRole('link', { name: 'Caldari Navy Multispectrum Shield Hardener' }));
    await page.getByText('Sell orders', { exact: false }).first().waitFor({ timeout: 30_000 });
    await settled(page);
    t.mark('market-item', 'Market: the module, Distance not set');
    await t.hold(4_000);
    t.mark('distance-open', 'Open Distance');
    await t.click(page.getByRole('combobox', { name: 'Distance' }).first());
    await page.getByRole('option', { name: 'Within 10 jumps' }).waitFor();
    await t.hold(1_500);
    t.mark('within-10-pick', 'Pick Within 10 jumps');
    await t.click(page.getByRole('option', { name: 'Within 10 jumps' }));
    await page.getByText(/Within 10 jumps of Nourvukaiken/).first().waitFor();
    await page.waitForTimeout(SETTLE);
    t.mark('within-10', 'Within 10 jumps of Nourvukaiken: 67 stations');
    await t.hold(4_500);
    const sells = page.getByRole('region', { name: 'Sell Orders' });
    t.mark('sort-jumps', 'Sort by jumps');
    await t.click(sells.getByRole('columnheader', { name: /Jumps/ }));
    await page.waitForTimeout(SETTLE);
    await t.hold(3_000);
    t.mark('sort-price', 'Sort by price: Oisio, 6 jumps, cheapest');
    const priceHead = sells.getByRole('columnheader', { name: /Price/ });
    await t.click(priceHead);
    await page.waitForTimeout(SETTLE);
    const firstRow = await sells.getByRole('row').nth(1).textContent();
    if (!firstRow?.includes('Oisio')) {
      await t.click(priceHead);
      await page.waitForTimeout(SETTLE);
    }
    await t.hold(4_500);
    t.mark('jump-link', 'Click the 6 jumps link on the Oisio row (opens Route Safety)');
    await t.click(
      sells.getByRole('row').filter({ hasText: 'Oisio 5 - Moon 6' }).first().getByRole('link', { name: /open route safety/ })
    );
    await page.waitForTimeout(1_500);
  });
  await shot('after-ch06');
  if (STOP <= 'ch06') return;

  // ---------------------------------------------------------------- ch07 Route
  // Starts on Route Safety (the jump link was the last click of ch06), cursor where that click was.
  await page.getByText(/Loading the last hour/).first().waitFor({ state: 'detached', timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(3_000);
  await runTake(page, `${OUT}/ch07`, async (t) => {
    const row = (name: string) => page.getByRole('row').filter({ hasText: name }).first();
    t.mark('route-shorter', 'Route Safety Nourvukaiken to Oisio, Shorter selected: 6 jumps, lowest 0.3, 1 chokepoint (Tama)');
    await t.hold(4_000);
    t.mark('system-list', 'Reads the trip system by system: glide down the list');
    for (const name of ['Nourvukaiken', 'Tama', '4 systems', 'Oisio']) await t.hover(row(name), 1_100);
    await t.hold(1_500);
    t.mark('three-kills', 'Tama, Gank Chokepoint: 3 kills in the last hour');
    await t.hover(page.getByRole('button', { name: /3 player kills/ }).first());
    await t.hold(4_000);
    t.mark('kills-click', 'Click the kill count');
    await t.click(page.getByRole('button', { name: /3 player kills/ }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('killmails', 'Killmails: what died, what killed it, when');
    await t.hold(5_000);
    t.mark('kills-close', 'Close the killmails');
    await t.click(page.getByRole('dialog').getByRole('button', { name: /close/i }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('safer-click', 'Click Safer');
    await t.click(page.getByRole('button', { name: /^Safer/ }).first());
    await page.waitForTimeout(3_000);
    t.mark('route-safer', 'Safer selected: route redraws, 8 jumps, all highsec');
    await t.hold(5_000);
    t.mark('waypoints-click', 'Click Set waypoints in game');
    await t.click(page.getByRole('button', { name: /Set waypoints in game/i }));
    await page.getByText(/Waypoints set/i).first().waitFor();
    t.mark('waypoints-set', 'Waypoints set.');
    await t.hold(2_000);
    await t.hold(2_500);
    t.mark('assets-click', 'Sidebar: Assets');
    await t.click(page.getByRole('navigation').getByRole('link', { name: 'Assets', exact: true }).first());
    await page.waitForTimeout(SETTLE);
    t.mark('move-tab', 'Open Move');
    await t.click(page.getByRole('tab', { name: 'Move' }).or(page.getByRole('main').getByRole('link', { name: 'Move', exact: true })).first());
    await page.getByText('What to move').waitFor();
    await settled(page);
    t.mark('scope-open', 'Header avatar: scope');
    await t.click(page.locator('header button, main button').filter({ has: page.locator('img') }).first());
    await t.hold(1_500);
    t.mark('scope-all', 'All characters');
    await t.click(page.getByText(/All characters/).first());
    await page.getByText('Tobin Raske').first().waitFor();
    await settled(page);
    await t.hold(2_500);
    const pick = (place: string, who: string) =>
      page.getByRole('checkbox', { name: new RegExp(`Select everything at ${place}.* for ${who}`) });
    t.mark('pick-stock', 'Pick the stock to move');
    await t.click(pick('Jita 4', 'Arden Kessil'));
    await t.hold(1_500);
    await t.click(pick('Tunttaras 10', 'Arden Kessil'));
    await t.hold(3_000);
    t.mark('deliver-to', 'Deliver to Sarekuwa');
    await t.click(page.getByRole('button', { name: /Pick a system/i }));
    await page.waitForTimeout(800);
    await page.keyboard.type('Sarekuwa', { delay: 90 });
    await page.waitForTimeout(1_500);
    await t.click(page.getByRole('option', { name: /Sarekuwa/ }).first());
    await t.hold(3_500);
    t.mark('show-plan', 'Show plan');
    await t.click(page.getByRole('button', { name: /Show plan/i }));
    await page.getByText('Haul', { exact: false }).first().waitFor();
    await page.waitForTimeout(SETTLE);
    await t.hold(3_500);
    t.mark('hauler', "Hauler: Occator, Tobin's ship");
    await t.click(page.getByRole('radio', { name: /Occator/ }));
    await page.waitForTimeout(SETTLE);
    await t.hold(3_500);
    t.mark('legs', 'Show my route: leg by leg');
    await t.click(page.getByRole('button', { name: /Show my route/i }));
    await page.getByText(/Set All Waypoints/i).first().waitFor();
    await page.waitForTimeout(SETTLE);
    await t.hold(5_000);
  });
  await shot('after-ch07');
});
