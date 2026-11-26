import { test } from '@playwright/test';
import { clickHere, glideTo, hideSandboxNoise, placePointer, startRecording } from '../../recorder';
import { openWorld } from '../world';
import { Markers, go, hover, paste } from '../mocks/D-common';
import { LOOT } from '../mocks/D2-loot';

const OUT = `${process.env.VIDEO_OUT ?? 'test-results/D2'}`;

test('D2 appraisal', async ({ page }) => {
  await hideSandboxNoise(page);
  await openWorld(page, './overview', {
    overview: [
      { kind: 'training', size: 'M' },
      { kind: 'wallet', size: 'M' },
      { kind: 'orders', size: 'M' },
      { kind: 'location', size: 'S' },
      { kind: 'industry', size: 'M' },
      { kind: 'comingUp', size: 'M' },
    ],
  });
  await page.getByText('Rapid Firing').first().waitFor();
  await page.waitForTimeout(3000);
  await placePointer(page, 760, 560);
  const m = new Markers();
  const rec = await startRecording(page, `${OUT}/D2`);
  m.begin();
  m.mark('overview-start', 'Overview (not the Appraisal page); cargo hold is about to be pasted');
  await page.waitForTimeout(4500);
  await paste(page, LOOT);
  m.mark('paste', 'cargo hold pasted: app routes itself to Market > Appraisal');
  await page.getByText('Veldspar').first().waitFor();
  await page.waitForTimeout(2500);
  await page.waitForTimeout(3500);
  m.mark('totals', 'Buy / Split / Sell totals');
  await hover(page, page.getByText('What buy orders pay'), 1100);
  await page.waitForTimeout(1500);
  await hover(page, page.getByText('Halfway between buy and sell').first(), 1000);
  await page.waitForTimeout(1500);
  await hover(page, page.getByText('What sell orders ask'), 1000);
  await page.waitForTimeout(3500);
  // The sell-into-buy walk: the amber "!" beside an ore row's Buy total.
  const bang = page.getByText('!', { exact: true }).nth(2);
  await hover(page, bang, 1200);
  m.mark('walk-tooltip', 'hover the ! on the ore row Buy total: how far down the buy orders the pile goes');
  await page.waitForTimeout(5000);
  // Refine breakdown.
  const refine = page.getByText('1.3M').first();
  await hover(page, refine, 1200);
  await clickHere(page);
  await page.getByText(/Refine breakdown/i).first().waitFor();
  await page.waitForTimeout(2500);
  m.mark('refine-breakdown', 'Refine breakdown open: refine or sell as is');
  await page.waitForTimeout(4500);
  await page.getByRole('dialog').evaluate((el) => {
    const box = [el, ...el.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 40 && getComputedStyle(n).overflowY !== 'visible');
    box?.scrollTo({ top: 460, behavior: 'smooth' });
  });
  await page.waitForTimeout(2500);
  m.mark('refine-by-item', 'by item: Refine vs Sell as is');
  await page.waitForTimeout(4500);
  await go(page, page.getByRole('dialog').getByRole('button', { name: /close/i }).first());
  await page.waitForTimeout(2500);
  // Copy lists per exit.
  await go(page, page.getByRole('button', { name: 'Appraisal actions' }), 1100);
  await page.waitForTimeout(1500);
  m.mark('copy-menu', 'copy lists per exit menu: Sell now, List at undercut, Refine, Multibuy');
  await page.waitForTimeout(3500);
  await go(page, page.getByRole('menuitem', { name: /List at undercut/ }), 1000);
  m.mark('copy-sell-list', 'List at undercut copied');
  await page.waitForTimeout(4000);
  await go(page, page.getByRole('button', { name: 'Appraisal actions' }), 1000);
  await page.waitForTimeout(1500);
  await go(page, page.getByRole('menuitem', { name: /^Refine/ }), 1000);
  m.mark('copy-refine-list', 'Refine list copied');
  await page.waitForTimeout(4000);
  // Compare hubs.
  await go(page, page.getByRole('button', { name: /Compare hubs/i }).first(), 1100);
  await page.waitForTimeout(2000);
  m.mark('compare-hubs', 'Compare hubs: Jita, Amarr, Dodixie, Rens, Hek totals');
  await page.waitForTimeout(5000);
  m.write(`${OUT}/D2`);
  await rec.stop();
});
