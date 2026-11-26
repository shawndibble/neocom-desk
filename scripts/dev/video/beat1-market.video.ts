/**
 * Promo beat 1, "Market by jumps": Market Browser on All regions for Nanite Repair Paste, then
 * Distance set to Within 10 jumps from a lowsec Current System (Amamake). Mock order books only.
 *
 *   VIDEO_OUT=<dir> npx playwright test -c scripts/dev/video/video.config.ts beat1
 */
import { test } from '@playwright/test';
import { openSandbox } from './sandboxPage';
import { installRegionOrders } from './marketOrders';
import {
  clickHere,
  glideTo,
  glideToPoint,
  hideSandboxNoise,
  placePointer,
  startRecording,
} from './recorder';

const OUT = process.env.VIDEO_OUT ?? 'test-results/video';
const AMAMAKE = 30002537;
const NANITE_REPAIR_PASTE = 28668;

test('beat 1: market by jumps', async ({ page }) => {
  await hideSandboxNoise(page);
  await openSandbox(page, `./market/browser?type=${NANITE_REPAIR_PASTE}&region=all`, {
    systemId: AMAMAKE,
    before: (p) => installRegionOrders(p, { [NANITE_REPAIR_PASTE]: 21_500 }),
  });
  const distance = page.getByRole('combobox', { name: 'Distance' }).first();
  await distance.waitFor();
  await page
    .getByText(/Sell orders/i)
    .first()
    .waitFor();
  await page.waitForTimeout(6_000); // let every region's book land and fonts settle
  await placePointer(page, 1000, 560);
  await page.screenshot({ path: `${OUT}/beat1-before.png` });

  const recording = await startRecording(page, `${OUT}/beat1-frames`);
  await page.waitForTimeout(1_800);
  await glideTo(page, distance, 900);
  await page.waitForTimeout(250);
  await clickHere(page);
  const option = page.getByRole('option', { name: 'Within 10 jumps' });
  await option.waitFor();
  await page.waitForTimeout(450);
  await glideTo(page, option, 550);
  await page.waitForTimeout(250);
  await clickHere(page);
  await page.waitForTimeout(900);
  await glideToPoint(page, 1000, 640, 900);
  await page.waitForTimeout(3_200);
  const result = await recording.stop();
  console.log(`recorded ${result.frames} frames over ${result.seconds.toFixed(2)}s`);
  await page.screenshot({ path: `${OUT}/beat1-after.png` });
});
