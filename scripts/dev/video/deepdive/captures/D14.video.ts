/**
 * D14: V4 "Running a corp: the officer's side", Corp Assets. One take: Corp Board, Corp Assets by location, tabs,
 * Stock targets (add Nitrogen Fuel Block), Below target, a container's contents. Sandbox Vite on 5173, no emulators.
 */
import { test } from '@playwright/test';
import { hideSandboxNoise } from '../../recorder';
import { openWorld } from '../world';
import { installHalcyonEsi } from '../mocks/D13-esi';
import { installAssets, STOCK_TARGETS_SETTING } from '../mocks/D14-assets';
import { record } from '../mocks/D13-rec';

test.setTimeout(300_000);

test('D14 corp assets', async ({ page }) => {
  await hideSandboxNoise(page);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await openWorld(page, './corp', {
    active: 'arden',
    settings: [STOCK_TARGETS_SETTING],
    before: async (p) => {
      await installHalcyonEsi(p);
      await installAssets(p);
    },
  });
  await page.waitForTimeout(8_000);
  const nav = (name: string) => page.getByRole('link', { name, exact: true }).first();
  await nav('Corp Assets').click();
  await page.getByRole('tab', { name: /^All/ }).waitFor();
  await page.waitForTimeout(8_000);
  await nav('Corp Board').click();
  await page.waitForTimeout(5_000);

  await record(page, '', async (t) => {
    await t.hold(1500);
    t.mark('board-start', 'Corp Board before heading to Corp Assets');
    await t.hold(1500);
    await t.click(nav('Corp Assets'));
    t.mark('assets-open', 'Corp Assets page opened from the sidebar, All tab');
    await t.hold(2000);
    await t.click(page.getByRole('radio', { name: 'Location' }).or(page.getByRole('button', { name: 'Location', exact: true })).first());
    t.mark('group-location', 'Grouped by Location: hangars per structure or station with items and value');
    await t.hold(4500);

    await t.hover(page.getByRole('tab', { name: /^Offices/ }));
    await t.hover(page.getByRole('tab', { name: /^Corp deliveries/ }));
    await t.hover(page.getByRole('tab', { name: /^Fuel bay/ }));
    await t.click(page.getByRole('tab', { name: /^Fuel bay/ }));
    t.mark('tab-fuel-bay', 'Fuel bay tab: fuel blocks held in each structure');
    await t.hold(4000);
    await t.click(page.getByRole('tab', { name: /^All/ }));
    t.mark('tab-back-all', 'Back on the All tab');
    await t.hold(1500);

    await t.click(page.getByRole('button', { name: 'Stock targets' }));
    t.mark('targets-open', 'Stock targets dialog: seeded targets with owned counts');
    await t.hold(3500);
    await t.click(page.getByRole('combobox', { name: /item/i }).or(page.getByPlaceholder('Search items…').last()).first());
    await page.keyboard.type('Nitrogen Fuel', { delay: 90 });
    t.mark('targets-type-item', 'Typing the item name into the Item field');
    await t.hold(1500);
    await t.click(page.getByRole('option', { name: 'Nitrogen Fuel Block' }).first());
    await t.hold(800);
    await page.keyboard.type('6000', { delay: 90 });
    t.mark('targets-quantity', 'Quantity 6,000 entered for Nitrogen Fuel Block');
    await t.hold(1500);
    await t.click(page.getByRole('button', { name: 'Add', exact: true }));
    t.mark('targets-added', 'Target added to the list');
    await t.hold(3500);
    await t.click(page.getByRole('button', { name: 'Done', exact: true }));
    t.mark('targets-done', 'Dialog closed');
    await t.hold(1500);

    await t.click(page.getByRole('button', { name: /^Below target/ }));
    t.mark('below-target', 'Below target filter: item types short of their stock target');
    await t.hold(4500);
    await t.click(page.getByRole('button', { name: /^Below target/ }));
    await t.hold(1500);

    await t.click(page.getByRole('row').filter({ hasText: 'Scourge Fury Heavy Missile ×4,000' }).getByText('Misc', { exact: true }));
    t.mark('location-open', 'Fortizar Misc hangar expanded');
    await t.hold(2500);
    await t.click(page.getByText('Quartermaster Crate').first());
    t.mark('container-open', 'Quartermaster Crate opened: its contents (CorpAssetContents)');
    await t.hold(5000);
  });
});
