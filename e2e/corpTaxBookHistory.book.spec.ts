/**
 * A Corp Tax Book with months of history on the Running account (decision 20261120-235011): the
 * officer's Miners list, a Miner's page and the Late notices tab.
 */
import { expect, minerFact, openMiner, signInAsOfficer, test } from './support/taxBook/bookTest';
import { historyBook } from './support/taxBook/bookScenarios';
import { isk, shortDay } from './support/taxBook/bookSeed';
import { MINER, solo } from './support/taxBook/identities';

const book = historyBook();

test.beforeEach(async ({ book: emulator }) => {
  await emulator.seed(book.seed.docs());
});

test('the Miners list shows what each Miner owes and who is paid through', async ({ page }) => {
  await signInAsOfficer(page, './corp/moons/miners');
  const table = page.getByRole('table', { name: 'Miners' });
  await expect(table.getByRole('row', { name: /Ada Lunar/ })).toContainText(
    `Owes ${isk(book.adaOwes.amount)} (${book.adaOwes.days} days, oldest ${shortDay(book.adaOwes.oldestBack)})`
  );
  await expect(table.getByRole('row', { name: /Bram Kessik/ })).toContainText(
    `Paid through ${shortDay(book.bramPaidThroughBack)}`
  );
  await expect(table.getByRole('row', { name: /Cora Vell/ })).toContainText(
    `Owes ${isk(book.coraOwes.amount)} (${book.coraOwes.days} days, oldest ${shortDay(book.coraOwes.oldestBack)})`
  );
});

test("a Miner's page reads what they owe, from their oldest unpaid day", async ({ page }) => {
  await openMiner(page, solo(MINER.ada.id), MINER.ada.name);
  await expect(page.getByRole('main')).toContainText(`Owed${isk(book.adaOwes.amount)}`);
  await expect(minerFact(page, 'Oldest unpaid')).toContainText(shortDay(book.adaOwes.oldestBack));
  await expect(
    page.getByRole('heading', { name: `Owed days · ${book.adaOwes.days}` })
  ).toBeVisible();
});

test('the old Statements address opens the Late notices tab', async ({ page }) => {
  await signInAsOfficer(page, './corp/moons/statements');
  await expect(page).toHaveURL(/\/corp\/moons\/late-notices$/);
  await expect(page.getByRole('tab', { name: 'Late notices', selected: true })).toBeVisible();
});

test('late notices are listed as sent', async ({ page }) => {
  await signInAsOfficer(page, './corp/moons/late-notices');
  const sent = page.getByRole('table', { name: 'Notices sent' });
  await expect(sent.getByRole('row', { name: /Ada Lunar/ })).toContainText(
    `Ada Lunar2${shortDay(book.notices.adaNovember.issuedBack)}${isk(book.adaOwes.amount)}`
  );
  await expect(sent.getByRole('row', { name: /Bram Kessik/ })).toContainText(
    // Nothing owed now: a dash.
    `Bram Kessik1${shortDay(book.notices.bram.issuedBack)}—`
  );
});

test('a settled notice reads as paid on the Miner page', async ({ page }) => {
  await openMiner(page, solo(MINER.ada.id), MINER.ada.name);
  const august = shortDay(book.notices.adaAugust.issuedBack);
  await page
    .getByRole('button', { name: `Open the late notice of ${august}` })
    .first()
    .click();
  const panel = page.getByRole('dialog', { name: MINER.ada.name });
  await expect(panel).toContainText(`Late notice · ${august}`);
  await expect(panel).toContainText(/Still owed of its days\s*0/);
  await expect(panel.locator('dt', { hasText: /^Due$/ }).locator('+ dd')).toHaveText('Paid');
});
