/** P11: phone. An alert for Mira's filled sell order arrives while the app is on Arden; tapping it switches to Mira and opens the sale. */
import { test } from '@playwright/test';
import { hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { MIRA, STATIONS } from '../cast';
import { T } from '../catalog';
import { hold, Marks, pressOn } from '../mocks/D5-kit';

const OUT = process.env.VIDEO_OUT ?? 'test-results/P11';

test.use({
  viewport: { width: 405, height: 720 },
  deviceScaleFactor: 2.667,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
});

test('P11 phone alert opens the alt order', async ({ page }) => {
  await hideSandboxNoise(page);
  await openWorld(page, './overview', { warm: true });
  await page.getByText('Rapid Firing').first().waitFor();
  await page.waitForTimeout(3000);
  // dismiss the one-time "Turn on notifications?" card before recording
  await page.getByRole('button', { name: /alerts/i }).first().tap();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /not now/i }).first().tap().catch(() => undefined);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /close/i }).first().tap().catch(() => undefined);
  await page.waitForTimeout(1500);
  await placePointer(page, 200, 400);
  const dir = `${OUT}/P11`;
  const rec = await startRecording(page, dir);
  const marks = new Marks();
  await page.waitForTimeout(2000);
  marks.mark('app-on-arden', 'Overview on the phone, signed in as Arden Kessil');
  await hold(page, 4);
  marks.mark('alert-arrives', "Mira's sell order fills: the Alerts bell gets a badge");
  await page.evaluate(
    async ({ mira, typeId, loc }) => {
      const { db } = await import('/src/db/index.ts');
      for (const [i, qty] of [[1, 4], [2, 2]] as const)
        await db.notificationFeed.put({
          id: `p11-fill-${i}`,
          characterId: mira,
          eventId: 'marketOrderFilled',
          title: 'Sell order filled',
          body: `${qty} x Retriever sold`,
          firedAt: Date.now() - i * 60_000,
          fillMatch: { typeId, locationId: loc, price: 7_900_000, issuedMs: Date.now() - 3 * 86_400_000, quantity: qty },
          fillSettledAt: Date.now() - i * 60_000,
        } as never);
    },
    { mira: MIRA.id, typeId: T.retriever, loc: STATIONS.tunttaras }
  );
  await page.waitForTimeout(1500);
  await hold(page, 4);
  marks.anchor();
  await pressOn(page, page.getByRole('button', { name: /alerts/i }).first());
  await page.waitForTimeout(2000);
  marks.mark('alerts-open', 'Alerts: Sell order filled, Market, minutes ago');
  await page.screenshot({ path: `${OUT}/p11-alerts.png` });
  await hold(page, 2.5);
  await pressOn(page, page.getByRole('button', { name: /Sell order filled, 2 alerts/ }));
  await page.waitForTimeout(1500);
  await hold(page, 2.5);
  await pressOn(page, page.locator('[data-fire-id] a').first());
  await page.waitForTimeout(3500);
  marks.mark('opened', 'The app switched to Mira Voskane and opened the filled order');
  await page.screenshot({ path: `${OUT}/p11-opened.png` });
  await hold(page, 5);
  const out = await rec.stop();
  marks.write(dir);
  console.log(`P11 ${out.frames} frames ${out.seconds.toFixed(1)}s`);
});
