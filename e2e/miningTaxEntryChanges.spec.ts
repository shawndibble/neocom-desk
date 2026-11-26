import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { CHARACTER_ID } from './support/fixtureData';
import { MINER } from './support/taxBook/identities';
import { isk } from './support/taxBook/bookSeed';
import {
  DAY_TAX,
  ROOK,
  openPersonalTax,
  payeeRecord,
  personalLedger,
  rookOwed,
} from './support/taxBook/personalSeed';

const DAYS = [6, 5, 4];
const OWED = DAYS.length * DAY_TAX;
const owedTo = (page: Page, name: string) => page.getByRole('group', { name });

async function openTab(page: Page) {
  const data = rookOwed(CHARACTER_ID, DAYS);
  data.payees!.push(
    payeeRecord({
      id: 'p-bram',
      characterId: CHARACTER_ID,
      name: MINER.bram.name,
      entityId: MINER.bram.id,
    })
  );
  await openPersonalTax(page, data, { characterId: CHARACTER_ID, mining: personalLedger(DAYS) });
  await expect(owedTo(page, ROOK.name)).toContainText(isk(OWED));
}

async function rowMenu(page: Page, item: string) {
  await page
    .getByRole('button', { name: /^More actions for .* in Jita$/ })
    .first()
    .click();
  await page.getByRole('menuitem', { name: item }).click();
}

test("won't pay: an entry taken off its Payee and dismissed is no longer owed", async ({
  page,
}) => {
  await openTab(page);
  await rowMenu(page, 'Unassign');
  await page.getByRole('dialog').getByRole('button', { name: 'Unassign' }).click();
  await expect(owedTo(page, ROOK.name)).toContainText(isk(OWED - DAY_TAX));
  await rowMenu(page, 'Dismiss');
  await expect(page.getByRole('cell', { name: 'Dismissed', exact: true })).toHaveCount(1);
  await expect(owedTo(page, ROOK.name)).toContainText(isk(OWED - DAY_TAX));
});

test('a changed tax % changes what the day owes', async ({ page }) => {
  await openTab(page);
  await rowMenu(page, 'Edit');
  const dialog = page.getByRole('dialog', { name: /^Edit / });
  await dialog.getByRole('spinbutton', { name: 'Tax %' }).fill('5');
  await expect(dialog.getByRole('textbox', { name: /^Tax owed on / })).toHaveValue(
    isk(DAY_TAX / 2)
  );
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(owedTo(page, ROOK.name)).toContainText(isk(OWED - DAY_TAX / 2));
});

test('a day split between Payees bills each its share', async ({ page }) => {
  await openTab(page);
  await rowMenu(page, 'Split between Payees');
  const dialog = page.getByRole('dialog', { name: /^Split / });
  await dialog.getByRole('combobox', { name: 'Move part of this day to' }).click();
  await page.getByRole('option', { name: MINER.bram.name }).click();
  await dialog.getByRole('spinbutton', { name: 'Tax %' }).fill('10');
  await dialog.getByRole('textbox', { name: /to move$/ }).fill('5000');
  await dialog.getByRole('button', { name: /^Split · / }).click();
  await expect(dialog).toBeHidden();
  await expect(owedTo(page, ROOK.name)).toContainText(isk(OWED - DAY_TAX / 2));
  await expect(owedTo(page, MINER.bram.name)).toContainText(isk(DAY_TAX / 2));
});
