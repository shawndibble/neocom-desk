import { test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clickHere, glideTo, glideToPoint, hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { Markers, dragTo, go, hover, paste } from '../mocks/D-common';
import { SAVED_ROUTE, installD1Widgets, seedQuickbar } from '../mocks/D1-widgets';
import { installOpenWindow } from '../mocks/D3-ui';
import { LOOT } from '../mocks/D2-loot';
import { ARDEN } from '../cast';

const ROOT = `${process.env.VIDEO_OUT ?? 'test-results/V1R'}`;
const REST = { x: 900, y: 600 }; // ch01 ends here, ch03 starts here

const OVERVIEW = [
  { kind: 'training', size: 'M' as const },
  { kind: 'wallet', size: 'M' as const },
  { kind: 'orders', size: 'M' as const },
  { kind: 'location', size: 'S' as const },
  { kind: 'industry', size: 'M' as const },
  { kind: 'comingUp', size: 'M' as const },
  { kind: 'mail', size: 'M' as const },
];

/** Typing at 90 ms per character into the focused field. */
const typeKeys = (page: Page, text: string) => page.keyboard.type(text, { delay: 90 });

/** A brief key-cap badge so the viewer sees the Ctrl+V moment (a capture overlay, not app UI). */
async function showCtrlV(page: Page, on: boolean) {
  await page.evaluate((show) => {
    document.getElementById('cap-ctrlv')?.remove();
    if (!show) return;
    const el = document.createElement('div');
    el.id = 'cap-ctrlv';
    el.textContent = 'Ctrl + V';
    el.setAttribute(
      'style',
      'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:99999;padding:14px 26px;border-radius:12px;font:600 26px system-ui,sans-serif;color:#fff;background:rgba(20,24,32,.92);border:2px solid #7aa2ff;box-shadow:0 8px 30px rgba(0,0,0,.5)'
    );
    document.body.appendChild(el);
  }, on);
}

async function pasteLoot(page: Page, m?: Markers) {
  await showCtrlV(page, true);
  await page.waitForTimeout(900);
  m?.mark('paste', 'Ctrl+V key-cap shown, cargo hold pasted');
  await paste(page, LOOT);
  await page.waitForTimeout(500);
  await showCtrlV(page, false);
}

async function warmAppraisal(page: Page) {
  await paste(page, LOOT);
  await page.getByText('Veldspar').first().waitFor();
  await page.waitForTimeout(3500);
  await page.goto('./overview');
  await page.getByText('Rapid Firing').first().waitFor();
  await page.waitForTimeout(2500);
}

test.describe.configure({ mode: 'serial' });

test('V1R ch01 hook', async ({ page }) => {
  await hideSandboxNoise(page);
  await openWorld(page, './overview', { overview: OVERVIEW });
  await page.getByText('Rapid Firing').first().waitFor();
  await warmAppraisal(page);
  await placePointer(page, REST.x, REST.y);
  const out = `${ROOT}/ch01`;
  const m = new Markers();
  const rec = await startRecording(page, out);
  m.begin();
  m.mark('overview', 'Overview, cursor at rest');
  await page.waitForTimeout(3500);
  await pasteLoot(page, m);
  await page.getByText('Veldspar').first().waitFor();
  await page.waitForTimeout(2000);
  m.mark('appraisal', 'routed to Market > Appraisal, priced');
  await page.waitForTimeout(2500);
  m.mark('totals', 'Buy / Split / Sell totals held');
  await page.waitForTimeout(5000);
  m.mark('end', 'hold on the priced appraisal; cursor parked at rest point');
  m.write(out);
  await rec.stop();
});

test('V1R ch02 home', async ({ page }) => {
  await hideSandboxNoise(page);
  await openWorld(page, './characters', { overview: OVERVIEW, before: installD1Widgets, settings: [SAVED_ROUTE] });
  await page.getByText('Mira Voskane').first().waitFor();
  await seedQuickbar(page, ARDEN.id);
  // Warm Overview and the widget gallery's data once, then come back.
  await page.getByRole('link', { name: /^Overview/i }).first().click();
  await page.getByText('Rapid Firing').first().waitFor();
  await page.waitForTimeout(4000);
  await page.goto('./characters');
  await page.getByText('Mira Voskane').first().waitFor();
  await page.waitForTimeout(2500);
  await placePointer(page, 900, 700);
  const out = `${ROOT}/ch02`;
  const m = new Markers();
  const rec = await startRecording(page, out);
  m.begin();
  m.mark('characters', 'Characters page: Arden, Mira, Tobin');
  await page.waitForTimeout(4500);
  await go(page, page.getByRole('link', { name: /^Overview/i }).first());
  await page.getByText('Rapid Firing').first().waitFor();
  await page.waitForTimeout(2000);
  m.mark('overview', 'Overview for Arden');
  await page.waitForTimeout(3500);
  await go(page, page.getByRole('button', { name: /Data updated/ }));
  await page.waitForTimeout(1200);
  m.mark('data-updated', 'Data updated menu open');
  await go(page, page.getByRole('menuitem', { name: 'Customize' }).or(page.getByRole('button', { name: 'Customize' })).last());
  await page.waitForTimeout(2000);
  m.mark('customize', 'Customizing bar');
  await page.waitForTimeout(3500);
  await go(page, page.getByRole('button', { name: /Add widget/ }));
  await page.waitForTimeout(2000);
  m.mark('gallery', 'widget gallery open');
  await page.waitForTimeout(3500);
  // Browse the grid: smooth scroll down and back.
  const scrollGallery = (top: number) =>
    page.getByRole('dialog').evaluate((el, t) => {
      const box = [el, ...el.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 40 && getComputedStyle(n).overflowY !== 'visible');
      box?.scrollTo({ top: t, behavior: 'smooth' });
    }, top);
  await glideToPoint(page, 720, 560, 900);
  await scrollGallery(380);
  await page.waitForTimeout(3500);
  m.mark('gallery-browse', 'browsing widget cards');
  await scrollGallery(800);
  await page.waitForTimeout(3500);
  await scrollGallery(0);
  await page.waitForTimeout(3000);
  for (const [title, q] of [['Item prices', 'Item prices'], ['Route safety', 'Route safety'], ['Skyhook raids', 'Skyhook raids']] as const) {
    const search = page.getByPlaceholder('Search widgets');
    await go(page, search);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    m.mark(`search-${title}`, `typing "${q}"`);
    await typeKeys(page, q);
    await page.waitForTimeout(1500);
    const btn = page.getByRole('button', { name: `Add ${title}`, exact: true });
    await hover(page, btn);
    await clickHere(page);
    m.mark(`add-${title}`, `added ${title}`);
    await page.waitForTimeout(3500);
  }
  await go(page, page.getByRole('button', { name: 'Done' }).last());
  await page.waitForTimeout(2500);
  m.mark('gallery-closed', 'gallery closed, new widgets at the bottom of the board');
  await page.waitForTimeout(3500);
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
  await go(page, page.getByRole('button', { name: 'Done' }).last());
  await page.waitForTimeout(3000);
  m.mark('customize-done', 'layout saved');
  await hover(page, page.getByText(/Next skill finishes/i).first());
  m.mark('next-chip', 'pointer on the Next chip in the header');
  await page.waitForTimeout(5000);
  m.write(out);
  await rec.stop();
});

test('V1R ch03 sell the loot', async ({ page }) => {
  await hideSandboxNoise(page);
  await openWorld(page, './overview', { overview: OVERVIEW });
  await page.getByText('Rapid Firing').first().waitFor();
  await paste(page, LOOT);
  await page.getByText('Veldspar').first().waitFor();
  await page.waitForTimeout(4000);
  await placePointer(page, REST.x, REST.y);
  const out = `${ROOT}/ch03`;
  const m = new Markers();
  const rec = await startRecording(page, out);
  m.begin();
  m.mark('appraisal', 'priced appraisal, cursor at ch01 rest point');
  await page.waitForTimeout(3500);
  await hover(page, page.getByText('What buy orders pay'), 1100);
  m.mark('buy', 'Buy total');
  await page.waitForTimeout(2000);
  await hover(page, page.getByText('Halfway between buy and sell').first(), 1000);
  m.mark('split', 'Split total');
  await page.waitForTimeout(2000);
  await hover(page, page.getByText('What sell orders ask'), 1000);
  m.mark('sell', 'Sell total');
  await page.waitForTimeout(3500);
  const bang = page.getByText('!', { exact: true }).nth(2);
  await hover(page, bang, 1200);
  m.mark('walk-tooltip', 'order-book walk tooltip on an ore row');
  await page.waitForTimeout(5000);
  const refine = page.getByText('1.3M').first();
  await hover(page, refine, 1200);
  await clickHere(page);
  await page.getByText(/Refine breakdown/i).first().waitFor();
  await page.waitForTimeout(2500);
  m.mark('refine-breakdown', 'Refine breakdown open');
  await page.waitForTimeout(4500);
  await page.getByRole('dialog').evaluate((el) => {
    const box = [el, ...el.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 40 && getComputedStyle(n).overflowY !== 'visible');
    box?.scrollTo({ top: 460, behavior: 'smooth' });
  });
  await page.waitForTimeout(2500);
  m.mark('refine-by-item', 'By item: refine vs sell as is');
  await page.waitForTimeout(4500);
  await go(page, page.getByRole('dialog').getByRole('button', { name: /close/i }).first());
  await page.waitForTimeout(2500);
  await go(page, page.getByRole('button', { name: 'Appraisal actions' }), 1100);
  await page.waitForTimeout(1500);
  m.mark('copy-menu', 'Appraisal actions menu');
  await page.waitForTimeout(3500);
  await go(page, page.getByRole('menuitem', { name: /List at undercut/ }), 1000);
  await page.waitForTimeout(900);
  m.mark('copy-sell-list', 'List at undercut, copied toast');
  await page.waitForTimeout(4000);
  m.write(out);
  await rec.stop();
});

test('V1R ch04 sell orders', async ({ page }) => {
  await hideSandboxNoise(page);
  await openWorld(page, './market/orders', { before: installOpenWindow });
  await page.getByText('Drake').first().waitFor();
  await page.waitForTimeout(4000);
  await placePointer(page, 900, 600);
  const out = `${ROOT}/ch04`;
  const m = new Markers();
  const rec = await startRecording(page, out);
  m.begin();
  m.mark('orders-arden', 'Open Orders, this character');
  await page.waitForTimeout(4500);
  await go(page, page.getByRole('button', { name: 'This character' }));
  await page.waitForTimeout(1800);
  m.mark('scope-menu', 'scope menu open');
  await page.waitForTimeout(3000);
  await go(page, page.getByRole('menuitemradio', { name: /All characters/ }).or(page.getByRole('option', { name: /All characters/ })).or(page.getByRole('menuitem', { name: /All characters/ })).first());
  await page.getByText('Retriever').first().waitFor();
  await page.waitForTimeout(2500);
  m.mark('scope-all', 'all characters, four undercut rows');
  await page.waitForTimeout(4500);
  await go(page, page.getByRole('button', { name: /^All \(/ }));
  await page.waitForTimeout(2500);
  const lse = page.getByRole('link', { name: 'Large Shield Extender II' }).or(page.getByText('Large Shield Extender II', { exact: true })).first();
  await lse.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await page.waitForTimeout(1800);
  await hover(page, lse, 1100);
  m.mark('alt-beaten', 'Large Shield Extender II, leave it alone');
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1500);
  await go(page, page.getByRole('button', { name: /^Needs you/ }));
  await page.waitForTimeout(2500);
  m.mark('needs-you', 'back on Needs you');
  await go(page, page.getByRole('button', { name: /Work through/ }).first());
  await page.waitForTimeout(2500);
  m.mark('work-through', 'Work through, order 1');
  await page.waitForTimeout(4000);
  const dialog = page.getByRole('dialog');
  await go(page, dialog.getByRole('button', { name: /^Copy / }));
  await page.waitForTimeout(900);
  m.mark('copy-price', 'price copied toast');
  await page.waitForTimeout(3500);
  await go(page, dialog.getByRole('button', { name: /Open in EVE/i }));
  await page.waitForTimeout(900);
  m.mark('open-in-eve', 'Open in EVE confirmation');
  await page.waitForTimeout(4000);
  await go(page, dialog.getByRole('button', { name: /^Next$/ }));
  await page.waitForTimeout(2000);
  m.mark('second-order', 'second order shown');
  await page.waitForTimeout(4000);
  m.write(out);
  await rec.stop();
});
