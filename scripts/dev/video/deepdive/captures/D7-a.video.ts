/**
 * D7-a (desktop 1440x960): Mira's Industry. Opportunities ranked with one locked row, "Plan" on a ready
 * product, the Build Plan (verdict, Calculations?, structure with rigs, cost index and cheaper systems,
 * make-or-buy, Buy ore instead, Owned Material Source, Copy shopping list).
 *
 *   VIDEO_OUT=/mnt/project-files/deep-dive-video/captures/D7 npx playwright test -c scripts/dev/video/video.config.ts D7-a
 */
import { test } from '@playwright/test';
import { hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { installD7 } from '../mocks/D7-world';
import { Marks, makeRig } from '../mocks/D7-rec';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D7';

test('D7-a: opportunities to the shopping list', async ({ page }) => {
  test.setTimeout(600_000);
  await hideSandboxNoise(page);
  await openWorld(page, './industry/opportunities', {
    active: 'mira',
    before: (p) => installD7(p),
    settings: [{ key: 'marketWideVisibleColumns', value: ['margin', 'vs90d', 'orderDepth', 'buildCost'] }],
  });
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Mobile Tractor Unit' }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(4000);
  await placePointer(page, 1150, 300);

  const marks = new Marks();
  const { glide, press, hold, type, scroll } = makeRig(page, marks);
  const rec = await startRecording(page, `${OUT}/D7-a`);
  await page.waitForTimeout(500);

  // 1. Opportunities, ranked
  marks.mark('opportunities-ranked', 'Industry Opportunities table: margin, ISK/hour, ISK/day, build cost');
  await glide(page.getByText('ISK/DAY', { exact: false }).first(), 1100);
  await hold(4500);
  marks.mark('opportunities-ranked-end');

  // 2. The locked row
  const lock = page.getByRole('button', { name: /Laser Physics/ }).first();
  marks.mark('locked-row', 'Mobile Tractor Unit carries a skill-gate chip');
  await glide(lock, 1100);
  await hold(1500);
  await page.waitForTimeout(400);
  await press(lock, 600);
  await hold(4500);
  marks.mark('locked-popover', 'Chip popover: missing skill, closest character, training time');
  await page.keyboard.press('Escape');
  await hold(1500);
  marks.mark('locked-row-end');

  // 3. Plan on a ready product
  const row = page.getByRole('row').filter({ hasText: 'Large Shield Extender II' }).first();
  marks.mark('plan-click', 'Plan button on Large Shield Extender II');
  await press(row.getByRole('button', { name: 'Plan' }), 1100);
  await page.getByRole('button', { name: 'Edit setup' }).waitFor({ timeout: 30_000 });
  await hold(2500);
  marks.mark('plan-open', 'Build Plan opens with the verdict');
  await hold(4500);
  marks.mark('plan-verdict', 'Verdict: profit, margin, ISK/hour, break-even');

  // 4. Runs
  const runs = page.getByLabel('Runs', { exact: true }).first();
  marks.mark('runs', 'Set 20 runs');
  await press(runs, 1000);
  await page.keyboard.press('Control+A');
  await type('20');
  await page.keyboard.press('Tab');
  await hold(4500);
  marks.mark('runs-end');

  // 5. Calculations?
  marks.mark('calculations-click', 'Calculations? button');
  await press(page.getByRole('button', { name: 'Calculations?' }), 1100);
  await page.getByText('How this Build Plan is calculated', { exact: false }).waitFor();
  await hold(4000);
  marks.mark('calculations-dialog', 'Calculations dialog: where prices come from, material cost, job cost, revenue');
  await glide(page.getByText('Material cost', { exact: false }).first(), 900).catch(() => undefined);
  await scroll(360, 30);
  await hold(3500);
  await scroll(360, 30);
  await hold(3500);
  marks.mark('calculations-end');
  await press(page.getByRole('button', { name: 'Close' }).first(), 1000);
  await hold(2500);

  // 6. Setup: structure, rigs, system, cost index, cheaper systems
  marks.mark('setup-open', 'Edit setup');
  await press(page.getByRole('button', { name: 'Edit setup' }), 1100);
  await hold(2500);
  await press(page.getByText('Override', { exact: true }), 1000);
  await hold(2000);
  await press(page.getByRole('combobox', { name: 'Facility' }), 1000);
  await hold(1500);
  await press(page.getByRole('option', { name: 'Raitaru' }), 900);
  await hold(2500);
  marks.mark('structure', 'Facility: Raitaru (structure)');
  const system = page.getByRole('textbox', { name: /build system/i });
  await press(system, 1000);
  await page.keyboard.press('Control+A');
  await type('Tunttaras');
  await page.keyboard.press('Tab');
  await hold(3500);
  marks.mark('build-system', 'Build system Tunttaras');
  const rigSlot = page.getByRole('combobox').filter({ hasText: 'None' }).first();
  await press(rigSlot, 1000);
  await hold(1500);
  await press(page.getByRole('option', { name: 'ME II', exact: true }).first(), 900);
  await hold(3500);
  marks.mark('rigs', 'Rig slot 1: ME II fitted');
  await scroll(260, 26);
  await hold(1500);
  const cheaper = page.getByText(/jump\) is .*% about|less\./i).first();
  await glide(page.getByText('Total job cost', { exact: false }).first(), 1000).catch(() => undefined);
  await hold(4500);
  marks.mark('cheaper-systems', 'Costs & revenue: cheaper system one jump away, "Build there"');
  void cheaper;
  await scroll(-0, 1);
  marks.mark('setup-end');

  // 7. Make or buy
  await page.mouse.wheel(0, 380);
  await page.waitForTimeout(800);
  const ram = page.getByRole('button', { name: /Build instead/ }).filter({ hasText: /Build instead/ }).nth(1);
  marks.mark('make-or-buy', 'Make-or-buy markers on component rows');
  await glide(ram, 1100);
  await hold(1500);
  marks.mark('make-or-buy-tooltip', 'Tooltip: Suggestion: Build, saves X');
  await hold(3500);
  await press(ram, 600);
  await hold(4000);
  marks.mark('make-or-buy-switched', 'Clicked: the part is now built, not bought');

  // 8. Buy ore instead
  marks.mark('buy-ore-click', 'Buy ore instead');
  await press(page.getByRole('button', { name: 'Buy ore instead' }), 1100);
  await page.getByText('Buy ore instead of minerals').waitFor();
  await hold(5000);
  marks.mark('buy-ore-dialog', 'Compressed ore, refines into, ore route vs minerals');
  await hold(2500);
  await press(page.getByRole('button', { name: 'Close' }).first(), 1000);
  await hold(2500);
  marks.mark('buy-ore-end');

  // 9. Owned materials
  marks.mark('owned-click', 'Owned Materials');
  await press(page.getByRole('button', { name: /Owned materials/i }), 1100);
  await hold(2500);
  marks.mark('owned-source', 'Owned Material Source picker');
  await press(page.getByRole('combobox').filter({ hasText: 'Everywhere' }), 1000);
  await hold(2000);
  await press(page.getByRole('option', { name: 'Selected locations' }), 900);
  await hold(2500);
  await press(page.getByRole('button', { name: /\d+ selected/ }), 1000);
  await hold(4500);
  await page.keyboard.press('Escape');
  await hold(1500);
  await hold(3500);
  marks.mark('owned-station', 'Source set to a station');
  await press(page.getByRole('button', { name: 'Use all' }), 1000);
  await hold(4500);
  marks.mark('owned-applied', 'Owned stock fills the Have column');
  await page.keyboard.press('Escape');
  await hold(2000);

  // 10. Shopping list
  marks.mark('copy-click', 'Copy shopping list for multibuy');
  await press(page.getByRole('button', { name: /Copy shopping list/i }), 1100);
  await hold(4500);
  marks.mark('copy-done', 'Copied toast');
  await hold(1000);
  const result = await rec.stop();
  marks.write(`${OUT}/D7-a`);
  console.log(`D7-a: ${result.frames} frames over ${result.seconds.toFixed(1)}s`);
});
