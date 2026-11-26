import { test } from '@playwright/test';
import { glideToPoint, hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { Markers, dragTo, go, hover, type } from '../mocks/D-common';
import { SAVED_ROUTE, installD1Widgets, seedQuickbar } from '../mocks/D1-widgets';
import { ARDEN } from '../cast';

const OUT = `${process.env.VIDEO_OUT ?? 'test-results/D1'}`;
const LAYOUT = [
  { kind: 'training', size: 'M' as const },
  { kind: 'wallet', size: 'M' as const },
  { kind: 'orders', size: 'M' as const },
  { kind: 'location', size: 'S' as const },
  { kind: 'industry', size: 'M' as const },
  { kind: 'comingUp', size: 'M' as const },
  { kind: 'mail', size: 'M' as const },
];

test('D1 home', async ({ page }) => {
  await hideSandboxNoise(page);
  await openWorld(page, './characters', { overview: LAYOUT, before: installD1Widgets, settings: [SAVED_ROUTE] });
  await page.getByText('Mira Voskane').first().waitFor();
  await seedQuickbar(page, ARDEN.id);
  await page.waitForTimeout(3000);
  await placePointer(page, 900, 700);
  const m = new Markers();
  const rec = await startRecording(page, `${OUT}/D1`);
  m.begin();
  m.mark('characters', 'Characters page: Arden, Mira, Tobin');
  await page.waitForTimeout(4500);
  const add = page.getByRole('button', { name: /add/i }).filter({ hasText: /add/i }).first();
  if (await add.count()) {
    await hover(page, add);
    m.mark('add-hover', 'pointer on Add character (not clicked)');
    await page.waitForTimeout(3500);
  }
  await go(page, page.getByRole('link', { name: /^Overview/i }).first());
  await page.getByText('Rapid Firing').first().waitFor();
  await page.waitForTimeout(2000);
  m.mark('overview', 'Overview for Arden, Next chip in header');
  await page.waitForTimeout(3500);
  await go(page, page.getByRole('button', { name: /Data updated/ }));
  await page.waitForTimeout(1200);
  await go(page, page.getByRole('menuitem', { name: 'Customize' }).or(page.getByRole('button', { name: 'Customize' })).last());
  await page.waitForTimeout(2000);
  m.mark('customize', 'Customizing bar');
  await page.waitForTimeout(3500);
  await go(page, page.getByRole('button', { name: /Add widget/ }));
  await page.waitForTimeout(2000);
  m.mark('gallery', 'widget Gallery open');
  await page.waitForTimeout(3500);
  for (const [title, q] of [['Item prices', 'Item'], ['Route safety', 'Route'], ['Skyhook raids', 'Skyhook']] as const) {
    const search = page.getByPlaceholder('Search widgets');
    await go(page, search);
    await search.fill('');
    await type(search, q);
    await page.waitForTimeout(1500);
    const btn = page.getByRole('button', { name: `Add ${title}`, exact: true });
    await hover(page, btn);
    m.mark(`add-${title}`, `Add ${title}`);
    await go(page, btn, 200);
    await page.waitForTimeout(3500);
  }
  await go(page, page.getByRole('button', { name: 'Done' }).last());
  await page.waitForTimeout(2500);
  m.mark('gallery-closed', 'gallery closed, new widgets at bottom of the board');
  await page.waitForTimeout(3500);
  // Drag Route safety up next to the Training row, then Skyhook raids up.
  for (const [title, over] of [['Route safety', 'Location and ship'], ['Skyhook raids', 'Calendar']] as const) {
    const handle = page.getByRole('button', { name: new RegExp(`^Move ${title}`) }).first();
    await handle.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await page.waitForTimeout(1500);
    await hover(page, handle);
    m.mark(`drag-${title}`, `drag ${title} into place`);
    const target = page.getByRole('button', { name: new RegExp(`^Move ${over}`) }).first();
    const box = (await target.boundingBox())!;
    await dragTo(page, box.x + 40, box.y + 20, 1200);
    await page.waitForTimeout(3500);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/D1-after-drag.png` });
  await go(page, page.getByRole('button', { name: 'Done' }).last());
  await page.waitForTimeout(3000);
  m.mark('customize-done', 'layout saved, widgets filled');
  await hover(page, page.getByText(/Next skill finishes/i).first());
  m.mark('next-chip', 'pointer on the Next deadline chip: skill finishing in ~37 minutes');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/D1-final.png` });
  m.write(`${OUT}/D1`);
  await rec.stop();
});
