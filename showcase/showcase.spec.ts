import { test, expect } from '@playwright/test';
import { seedAndBoot } from './support/seed';
import { isolateNetwork } from './support/network';
import { installPriceMock } from './support/prices';
import { buildFixture } from './support/fixture';
import { capture, goTo, shoot } from './support/shot';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await isolateNetwork(page);
  await installPriceMock(page);
  await seedAndBoot(page, buildFixture());
});

/* ----------------------------------------------------------------- pages */

test('overview', async ({ page }) => {
  await capture(page, '01-overview', '/overview', { settleMs: 3_500 });
});

test('alerts', async ({ page }) => {
  await capture(page, '02-alerts', '/alerts', { settleMs: 1_800 });
});

test('skill plans', async ({ page }) => {
  await capture(page, '03-skill-plans', '/skills/plans', { settleMs: 2_000 });
});

test('skill plan editor', async ({ page }) => {
  await goTo(page, '/skills/plans', { settleMs: 1_500 });
  await page.getByText('Capital Production').click();
  await page.waitForTimeout(2_500);
  await shoot(page, '04-skill-plan-editor');
});

test('trained skills', async ({ page }) => {
  await capture(page, '05-skills-trained', '/skills/trained', { settleMs: 2_000 });
});

test('industry build plans', async ({ page }) => {
  await capture(page, '06-industry-build-plans', '/industry', { settleMs: 4_000 });
});

test('industry plan detail', async ({ page }) => {
  await goTo(page, '/industry', { settleMs: 3_000 });
  await page.getByText('Raven line — Jita').click();
  await page.waitForTimeout(4_000);
  await shoot(page, '07-industry-plan-detail');
});

test('industry records', async ({ page }) => {
  await capture(page, '08-industry-records', '/industry?tab=records', { settleMs: 3_000 });
});

test('bpc sourcing', async ({ page }) => {
  await capture(page, '09-industry-bpc-search', '/industry?tab=sourcing', { settleMs: 3_000 });
});

test('corp board', async ({ page }) => {
  await capture(page, '10-corp-board', '/corp', { settleMs: 3_000 });
});

test('corp members', async ({ page }) => {
  await capture(page, '11-corp-members', '/corp/members', { settleMs: 2_500 });
});

test('corp assets', async ({ page }) => {
  await capture(page, '12-corp-assets', '/corp/assets', { settleMs: 2_500 });
});

test('mining tax', async ({ page }) => {
  await capture(page, '13-mining-tax', '/moon-mining', { settleMs: 3_000 });
});

test('contracts', async ({ page }) => {
  await capture(page, '14-contracts', '/contracts', { settleMs: 2_500 });
});

test('contract search', async ({ page }) => {
  await capture(page, '15-contract-search', '/contracts?tab=search', { settleMs: 3_000 });
});

test('courier search', async ({ page }) => {
  await goTo(page, '/contracts?tab=search', { settleMs: 2_500 });
  await page.getByRole('button', { name: 'Courier' }).click();
  await page.waitForTimeout(2_000);
  await shoot(page, '16-courier-search');
});

test('open orders', async ({ page }) => {
  await goTo(page, '/market?section=orders', { settleMs: 3_000 });
  // Healthy orders collapse behind a disclosure by default — the panel leads
  // with what needs work. Expanded is the view worth showing.
  const reveal = page.getByRole('button', { name: /show healthy orders/i });
  if (await reveal.isVisible().catch(() => false)) await reveal.click();
  await page.waitForTimeout(2_500);
  await shoot(page, '17-open-orders');
});

test('market browser', async ({ page }) => {
  await capture(page, '18-market', '/market', { settleMs: 3_000 });
});

test('wallet', async ({ page }) => {
  await capture(page, '19-wallet', '/wallet', { settleMs: 2_500 });
});

test('assets', async ({ page }) => {
  await capture(page, '20-assets', '/assets', { settleMs: 2_500 });
});

test('planetary industry', async ({ page }) => {
  await capture(page, '21-planetary-industry', '/planetary-industry', { settleMs: 3_000 });
});

/* ---------------------------------------------------------------- modals */

test('contract detail modal', async ({ page }) => {
  await goTo(page, '/contracts', { settleMs: 2_500 });
  await page.getByText('Corp mineral resupply').click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2_000);
  await shoot(page, '22-modal-contract-detail', { viewportOnly: true });
});

test('public contract modal', async ({ page }) => {
  await goTo(page, '/contracts?tab=search', { settleMs: 3_000 });
  await page.getByRole('row').filter({ hasText: 'Ishtar' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2_000);
  await shoot(page, '23-modal-public-contract', { viewportOnly: true });
});

test('bpc contract modal', async ({ page }) => {
  await goTo(page, '/industry?tab=sourcing', { settleMs: 3_000 });
  await page.getByRole('row').filter({ hasText: 'Ishtar Blueprint' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2_000);
  await shoot(page, '24-modal-bpc-contract', { viewportOnly: true });
});

test('order detail modal', async ({ page }) => {
  await goTo(page, '/market?section=orders', { settleMs: 3_000 });
  const reveal = page.getByRole('button', { name: /show healthy orders/i });
  if (await reveal.isVisible().catch(() => false)) await reveal.click();
  await page.waitForTimeout(1_500);
  await page.getByRole('button', { name: /^details$/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(3_000);
  await shoot(page, '25-modal-order-detail', { viewportOnly: true });
});
