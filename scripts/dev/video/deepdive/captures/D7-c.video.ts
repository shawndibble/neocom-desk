/**
 * D7-c (S12, desktop 1440x960): the skill-lock chip. Mobile Tractor Unit needs Laser Physics, which nobody on
 * the account has trained: the Opportunities chip, then the same chip on the plan with closest character and
 * training time.
 */
import { test } from '@playwright/test';
import { hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { installD7 } from '../mocks/D7-world';
import { Marks, makeRig } from '../mocks/D7-rec';

const OUT = process.env.VIDEO_OUT ?? 'test-results/D7';

test('D7-c: skill lock', async ({ page }) => {
  test.setTimeout(300_000);
  await hideSandboxNoise(page);
  await openWorld(page, './industry/opportunities', {
    active: 'mira',
    before: (p) => installD7(p, { lockSubBuild: true }),
    settings: [{ key: 'marketWideVisibleColumns', value: ['margin', 'vs90d', 'orderDepth', 'buildCost'] }],
  });
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Mobile Tractor Unit' }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(4000);
  await placePointer(page, 1150, 300);

  const marks = new Marks();
  const { glide, press, hold } = makeRig(page, marks);
  const rec = await startRecording(page, `${OUT}/D7-c`);
  await page.waitForTimeout(500);

  marks.mark('locked-row', 'Opportunities table');
  await glide(page.getByRole('row').filter({ hasText: 'Large Shield Extender II' }).first(), 1100);
  await hold(3500);
  marks.mark('plan-click', 'Plan on Large Shield Extender II');
  const plan = page.getByRole('row').filter({ hasText: 'Large Shield Extender II' }).first();
  await press(plan.getByRole('button', { name: 'Plan' }), 1100);
  await page.getByRole('button', { name: 'Edit setup' }).waitFor({ timeout: 30_000 });
  await hold(3000);
  marks.mark('plan-open', 'Build Plan, Sustained Shield Emitter set to buy');
  const emitter = page.getByRole('row').filter({ hasText: 'Sustained Shield Emitter' }).first();
  await press(emitter.getByRole('button', { name: /Build instead/ }), 1100);
  await hold(3500);
  marks.mark('build-switched', 'Sustained Shield Emitter switched to build; skill-lock chip appears beside the plan name');
  const chip = page.getByRole('button', { name: /No character on this account can install this job/ }).first();
  await press(chip, 1100);
  await hold(5000);
  marks.mark('skill-lock-popover', 'No character on this account can install this job; closest character and training time');
  await hold(1000);
  const result = await rec.stop();
  marks.write(`${OUT}/D7-c`);
  console.log(`D7-c: ${result.frames} frames over ${result.seconds.toFixed(1)}s`);
});
