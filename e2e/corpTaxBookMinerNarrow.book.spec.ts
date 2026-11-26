import type { Locator, Page } from '@playwright/test';
import { PHONE } from './support/testBase';
import { expectNoPageOverflow } from './support/overflow';
import { expect, openMiner, test } from './support/taxBook/bookTest';
import { historyBook } from './support/taxBook/bookScenarios';
import { isk, shortDay } from './support/taxBook/bookSeed';
import { MINER, solo } from './support/taxBook/identities';

test.use({ viewport: PHONE });

const book = historyBook();

test.beforeEach(async ({ book: emulator }) => {
  await emulator.seed(book.seed.docs());
});

async function expectWithinWidth(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

test("a Miner's page fits a phone", async ({ page }) => {
  await openMiner(page, solo(MINER.ada.id), MINER.ada.name);
  await expect(page.getByRole('main')).toContainText(`Owed${isk(book.adaOwes.amount)}`);
  await expectWithinWidth(page, page.getByRole('heading', { level: 1, name: MINER.ada.name }));
  await expectWithinWidth(page, page.getByRole('table', { name: 'Owed days' }));
  await expectNoPageOverflow(page);
});

test("the account ledger's running balance stays on screen on a phone", async ({ page }) => {
  await openMiner(page, solo(MINER.ada.id), MINER.ada.name);
  const ledger = page.getByRole('table', { name: 'Ledger', exact: true });
  await expectWithinWidth(page, ledger);
  const payment = ledger.getByRole('row', { name: /Payment from Ada Lunar/ });
  const balance = payment.getByRole('cell').nth(4);
  await balance.scrollIntoViewIfNeeded();
  await expect(balance).toBeVisible();
  await expectWithinWidth(page, balance);
  await expectNoPageOverflow(page);
});

test("a late notice's panel fits a phone", async ({ page }) => {
  await openMiner(page, solo(MINER.ada.id), MINER.ada.name);
  const august = shortDay(book.notices.adaAugust.issuedBack);
  await page.getByRole('button', { name: 'Show Earlier days' }).click();
  await page
    .getByRole('button', { name: `Open the late notice of ${august}` })
    .first()
    .click();
  const panel = page.getByRole('dialog', { name: MINER.ada.name });
  await expect(panel).toContainText(`Late notice · ${august}`);
  await expectWithinWidth(page, panel);
  await expectNoPageOverflow(page);
});
