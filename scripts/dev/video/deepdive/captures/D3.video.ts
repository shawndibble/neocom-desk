import { test } from '@playwright/test';
import { hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { Markers, go, hover } from '../mocks/D-common';
import { installOpenWindow } from '../mocks/D3-ui';

const OUT = `${process.env.VIDEO_OUT ?? 'test-results/D3'}`;

test('D3 orders', async ({ page }) => {
  await hideSandboxNoise(page);
  await openWorld(page, './market/orders', { before: installOpenWindow });
  await page.getByText('Drake').first().waitFor();
  await page.waitForTimeout(4000);
  await placePointer(page, 900, 600);
  const m = new Markers();
  const rec = await startRecording(page, `${OUT}/D3`);
  m.begin();
  m.mark('orders-arden', 'Open Orders, scope: this character (Arden), 5 need you');
  await page.waitForTimeout(4500);
  await go(page, page.getByRole('button', { name: 'This character' }));
  await page.waitForTimeout(1800);
  m.mark('scope-menu', 'scope menu open');
  await page.waitForTimeout(3000);
  await go(page, page.getByRole('menuitemradio', { name: /All characters/ }).or(page.getByRole('option', { name: /All characters/ })).or(page.getByRole('menuitem', { name: /All characters/ })).first());
  await page.getByText('Retriever').first().waitFor();
  await page.waitForTimeout(2500);
  m.mark('scope-all', 'scope: all characters; four undercut orders incl. Mira\'s Retriever');
  await page.waitForTimeout(4500);
  // The alt-beaten order is not flagged: show it in All.
  await go(page, page.getByRole('button', { name: /^All \(/ }));
  await page.waitForTimeout(2500);
  const lse = page.getByRole('link', { name: 'Large Shield Extender II' }).or(page.getByText('Large Shield Extender II', { exact: true })).first();
  await lse.waitFor();
  await hover(page, lse, 1100);
  m.mark('alt-beaten', "Arden's Large Shield Extender II (beaten only by Mira's own order) is not flagged");
  await page.waitForTimeout(5000);
  await go(page, page.getByRole('button', { name: /^Needs you/ }));
  await page.waitForTimeout(2500);
  m.mark('needs-you', 'Needs you list, all characters');
  await page.waitForTimeout(3500);
  // Work through.
  await go(page, page.getByRole('button', { name: /Work through/ }).first());
  await page.waitForTimeout(2500);
  m.mark('work-through-1', 'Work through opens on order 1 (Drake): new price, Copy, Open in EVE, Next');
  await page.waitForTimeout(4000);
  const dialog = page.getByRole('dialog');
  for (let i = 1; i <= 4; i += 1) {
    if (i > 1) {
      await page.waitForTimeout(2000);
      m.mark(`work-through-${i}`, `Work through, order ${i}`);
      await page.waitForTimeout(3000);
    }
    await go(page, dialog.getByRole('button', { name: /^Copy / }));
    m.mark(`copy-price-${i}`, 'new price copied');
    await page.waitForTimeout(3500);
    if (i <= 2) {
      await go(page, dialog.getByRole('button', { name: /Open in EVE/i }));
      m.mark(`open-market-${i}`, 'Open in EVE pressed (ESI answers 204)');
      await page.waitForTimeout(4000);
    }
    await go(page, dialog.getByRole('button', { name: /^Next$/ }));
  }
  await page.waitForTimeout(3500);
  m.mark('work-through-end', 'after the fourth step');
  m.write(`${OUT}/D3`);
  await rec.stop();
});
