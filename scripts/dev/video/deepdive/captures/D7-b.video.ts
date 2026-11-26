/**
 * D7-b (desktop 1440x960): the build after the plan. The delivered job in the Jobs list, "Log production",
 * the Production Run, Unsold cost, Watch Open Order, Sold + Link, Mark as lost with insurance, Realized
 * profit and its breakdown, then the Production Log (total realized profit, profit over time).
 *
 * The plan is created through the UI before recording starts (as D7-a does), plus earlier builds seeded
 * as local data so the Production Log has history.
 */
import { test } from '@playwright/test';
import { hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { installD7 } from '../mocks/D7-world';
import { seedHistory } from '../mocks/D7-seed';
import { Marks, makeRig } from '../mocks/D7-rec';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D7';

test('D7-b: log it, sell it, realized profit', async ({ page }) => {
  test.setTimeout(900_000);
  await hideSandboxNoise(page);
  await openWorld(page, './industry/opportunities', {
    active: 'mira',
    before: (p) => installD7(p),
    settings: [
      { key: 'productionLogItemVisibleColumns', value: ['runsLogged', 'unitsProduced', 'unitsSold', 'realizedProfit', 'avgMargin', 'unsoldCost'] },
    ],
  });
  await page.waitForTimeout(3000);
  await seedHistory(page);
  await page.goto('./industry/opportunities');
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  const planRow = page.getByRole('row').filter({ hasText: 'Large Shield Extender II' }).first();
  await planRow.getByRole('button', { name: 'Plan' }).waitFor({ timeout: 90_000 });
  await planRow.getByRole('button', { name: 'Plan' }).click();
  await page.getByRole('button', { name: 'Edit setup' }).waitFor({ timeout: 30_000 });
  const runs = page.getByLabel('Runs', { exact: true }).first();
  await runs.fill('20');
  await runs.press('Tab');
  await page.waitForTimeout(3000);
  await placePointer(page, 1150, 300);

  const marks = new Marks();
  const { glide, press, hold, scroll } = makeRig(page, marks);
  const rec = await startRecording(page, `${OUT}/D7-b`);
  await page.waitForTimeout(500);

  // 1. Jobs list: the finished job
  marks.mark('jobs-open', 'Jobs strip');
  await press(page.getByRole('button', { name: /Show job list/i }), 1100);
  await hold(2500);
  await press(page.getByText('History', { exact: true }).first(), 1000);
  await hold(2500);
  marks.mark('jobs-finished', 'History: the finished Large Shield Extender II job, 20 runs');
  const jobRow = page.getByRole('row').filter({ hasText: 'Large Shield Extender II Blueprint' });
  await glide(jobRow.first(), 1000);
  await hold(4000);
  marks.mark('log-production-click', 'Log production on the finished job');
  await press(jobRow.getByRole('button', { name: 'Log production' }), 1100);
  await page.getByRole('button', { name: 'Save run' }).waitFor();
  await hold(4500);
  marks.mark('log-production-dialog', 'Run quantity 20, material cost, job cost, total cost');
  await press(page.getByRole('button', { name: 'Save run' }), 1100);
  await hold(3000);
  marks.mark('run-saved');

  // 2. The production run on the plan
  await press(page.getByText('Production runs', { exact: false }).first(), 1000);
  await hold(1000);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1500);
  await hold(2500);
  marks.mark('production-run', 'Production Run row: 20 units, total cost, status New');
  await hold(4000);
  marks.mark('production-run-end');

  // 3. Watch Open Order
  marks.mark('more-sale-options', 'More sale options menu');
  await press(page.getByRole('button', { name: 'More sale options' }), 1100);
  await hold(3500);
  marks.mark('more-sale-menu', 'Menu: Watch Open Order, Manual / Private Sale, Mark as lost');
  await press(page.getByRole('menuitem', { name: /Watch Open Order/i }), 1000);
  await hold(3500);
  marks.mark('watch-dialog', 'Your open sell order of this item, 0 / 6 filled');
  await press(page.getByRole('button', { name: 'Watch', exact: true }), 1000);
  await hold(4000);
  marks.mark('watching', 'Order now watched');

  // 4. Sold: link wallet transactions
  const dialogClose = () => page.getByRole('dialog').getByRole('button', { name: 'Close' }).first();
  if (await page.getByRole('dialog').count()) await press(dialogClose(), 900);
  await hold(2000);
  for (let i = 0; i < 3; i += 1) {
    if (i === 0) marks.mark('sold-click', 'Sold button');
    await press(page.getByRole('button', { name: 'Sold', exact: true }), 1100);
    await hold(i === 0 ? 3500 : 2500);
    if (i === 0) marks.mark('sold-dialog', 'Wallet transactions for this item, each with Link');
    await press(page.getByRole('dialog').getByRole('button', { name: 'Link', exact: true }).first(), 1000);
    await hold(3000);
    if (await page.getByRole('dialog').count()) await press(dialogClose(), 900);
    await hold(1500);
  }
  marks.mark('sales-linked', 'Three sales linked, 12 units sold');
  await hold(3500);
  marks.mark('linked-sales-row', 'Run shows linked sales and realized profit');

  // 5. Mark as lost
  await press(page.getByRole('button', { name: 'More sale options' }), 1100);
  await hold(2500);
  await press(page.getByRole('menuitem', { name: /Mark as lost/i }), 1000);
  await hold(3000);
  marks.mark('lost-dialog', 'Mark as lost form');
  const units = page.getByRole('dialog').getByLabel('Units lost');
  await press(units, 900);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('2', { delay: 70 });
  await hold(2000);
  await press(page.getByRole('radio', { name: /From wallet/i }).or(page.getByText('From wallet', { exact: true })).first(), 900);
  await hold(2500);
  await press(page.getByRole('dialog').getByRole('radio').first(), 900);
  await hold(4500);
  marks.mark('lost-insurance', 'Insurance payout picked from the wallet; cost written off, insurance, net loss');
  await press(page.getByRole('dialog').getByRole('button', { name: 'Mark as lost' }).last(), 1000);
  await hold(4500);
  marks.mark('lost-saved', 'Run shows "2 lost"');

  // 6. Realized profit and its breakdown
  const profitCell = page.getByRole('row').filter({ hasText: '11/25/2026' }).first();
  marks.mark('realized-profit', 'Realized profit in the run row');
  await glide(profitCell, 1000);
  await hold(3500);
  await press(profitCell.getByRole('button', { name: 'Calculations?' }), 1000);
  await hold(5500);
  marks.mark('realized-breakdown', 'Breakdown: revenue, sales tax, broker fee, net loss line, margin');
  await hold(2500);
  await page.keyboard.press('Escape');
  await hold(2500);
  marks.mark('realized-end');

  // 7. Logs: unsold cost, open inventory value, total realized profit, chart
  await page.mouse.wheel(0, -2000);
  await page.waitForTimeout(1200);
  marks.mark('logs-tab-click', 'Logs tab');
  await press(page.getByRole('tab', { name: 'Logs' }).or(page.getByRole('link', { name: 'Logs' })).first(), 1100);
  await page.getByText('Total realized profit').first().waitFor({ timeout: 30_000 });
  await hold(3000);
  marks.mark('production-log', 'Production Log: total realized profit, open inventory value');
  await hold(4500);
  marks.mark('profit-chart', 'Realized profit over time chart');
  await glide(page.getByRole('img', { name: 'Realized profit over time' }), 1000);
  await hold(5000);
  await scroll(360, 30);
  await hold(3500);
  marks.mark('by-item', 'By item: units produced and sold, Unsold cost');
  await hold(4500);
  marks.mark('production-log-end');
  const result = await rec.stop();
  marks.write(`${OUT}/D7-b`);
  console.log(`D7-b: ${result.frames} frames over ${result.seconds.toFixed(1)}s`);
});
