/**
 * D8 (desktop 1440x960): Wallet Journal across all characters. "Where the isk went" by type, then by party,
 * alt transfers left out, click a day on the chart, then the market lines that name the item and quantity
 * (the D7 Large Shield Extender II sales).
 *
 *   VIDEO_OUT=/mnt/project-files/deep-dive-video/captures/D8 npx playwright test -c scripts/dev/video/video.config.ts D8
 */
import { test } from '@playwright/test';
import { hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { installD7 } from '../mocks/D7-world';
import { Marks, makeRig } from '../mocks/D7-rec';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D8';

test('D8: wallet journal, all characters', async ({ page }) => {
  test.setTimeout(400_000);
  await hideSandboxNoise(page);
  await openWorld(page, './wallet/journal', { active: 'arden', before: (p) => installD7(p) });
  await page.getByText('Market: ', { exact: false }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await placePointer(page, 1000, 500);

  const marks = new Marks();
  const { glide, glidePoint, press, hold, type, scroll } = makeRig(page, marks);
  const rec = await startRecording(page, `${OUT}/D8`);
  await page.waitForTimeout(500);

  marks.mark('journal-one-character', 'Wallet Journal, this character');
  await glide(page.getByText('entries', { exact: false }).first(), 1100);
  await hold(4000);

  // Scope: all characters
  const scopeButton = page.locator('header button, [data-scope-trigger]').filter({ has: page.locator('img') }).last();
  marks.mark('scope-click', 'Character scope control');
  await page.mouse.move(0, 0);
  await glidePointXY(1297, 34);
  async function glidePointXY(x: number, y: number) {
    await glidePoint(x, y, 1100);
  }
  await page.waitForTimeout(450);
  const { clickHere } = await import('../../recorder');
  await clickHere(page);
  await hold(2500);
  marks.mark('scope-menu', 'Menu: This character / All characters');
  await press(page.getByRole('menuitemradio', { name: /All characters/ }).or(page.getByRole('menuitem', { name: /All characters/ })).first(), 1000);
  await page.waitForTimeout(2500);
  await hold(3500);
  marks.mark('all-characters', 'Journal now spans all three characters');
  void scopeButton;
  const leftOut = page.getByText(/entries? between your Characters left out/);
  await glide(leftOut, 1100);
  await hold(4000);
  marks.mark('left-out', '"entries between your Characters left out": alt transfers not counted as income');

  // Where the ISK went
  marks.mark('where-click', 'Where the ISK went');
  await press(page.getByRole('button', { name: 'Where the ISK went' }), 1100);
  await page.getByText('Daily flow', { exact: false }).first().waitFor();
  await hold(4000);
  marks.mark('where-by-type', 'Where the ISK went, by type: bounty prizes, market transactions, insurance, fees');
  await hold(4000);
  await press(page.getByRole('tab', { name: 'By party' }).or(page.getByRole('button', { name: 'By party' })).first(), 1000);
  await hold(4500);
  marks.mark('where-by-party', 'By party: who paid or received the ISK');
  await hold(2500);
  await press(page.getByRole('tab', { name: 'By type' }).or(page.getByRole('button', { name: 'By type' })).first(), 1000);
  await hold(2500);
  marks.mark('between-characters', 'Between your Characters, not counted in In or Out');
  await glide(page.getByText(/Between your Characters ·/).first(), 1100);
  await hold(4500);

  // Click a day on the chart
  const flow = page.getByText('Daily flow').first();
  const box = (await flow.boundingBox())!;
  const dayX = Number(process.env.D8_DAY_X ?? 1384);
  const dayY = box.y + 55;
  marks.mark('chart-day-hover', 'Hover a day on the chart');
  await glidePoint(dayX, dayY, 1100);
  await hold(3000);
  marks.mark('chart-day-click', 'Click the day');
  await page.waitForTimeout(450);
  await clickHere(page);
  await hold(4500);
  marks.mark('day-filtered', 'Journal filtered to that day');
  await hold(3000);

  // Market lines naming item and quantity
  const sale = page.getByText(/Large Shield Extender II/).first();
  await sale.waitFor({ timeout: 20_000 });
  await press(sale, 1100);
  await hold(1);
  marks.mark('market-lines', 'Market lines naming the item and quantity (Large Shield Extender II sales)');
  await hold(5000);
  const result = await rec.stop();
  marks.write(`${OUT}/D8`);
  console.log(`D8: ${result.frames} frames over ${result.seconds.toFixed(1)}s`);
  void type;
  void scroll;
});
