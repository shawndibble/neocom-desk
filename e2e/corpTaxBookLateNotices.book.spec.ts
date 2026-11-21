/**
 * Late notices (GLOSSARY "Late notice"; decision 20261120-235011): an officer plans and issues
 * them from the Late notices tab and reads the mail first; the Miner opens the verify link (no
 * login), sees what they owe now and how to pay with their one payment code, and can stop
 * reminders; an old link from before the move still opens; closing a guest's account leaves a
 * final notice.
 */
import type { Page } from '@playwright/test';
import { expect, minerUrl, signInAsOfficer, test } from './support/taxBook/bookTest';
import { lateNoticeBook } from './support/taxBook/bookScenarios';
import { isk, minerPaymentCode, shortDay } from './support/taxBook/bookSeed';
import { readCollection, readDoc } from './support/taxBook/emulator';
import { CORP, MINER, OFFICER, solo } from './support/taxBook/identities';

const book = lateNoticeBook();

test.beforeEach(async ({ book: emulator, esi }) => {
  await emulator.seed(book.seed.docs());
  // The officer's Character mails the notices (the send queue, ESI's mail endpoint).
  esi((path, route) =>
    path === `/characters/${OFFICER.id}/mail` && route.request().method() === 'POST'
      ? 700_000_001
      : undefined
  );
});

async function openRun(page: Page) {
  await signInAsOfficer(page, './corp/moons/late-notices');
  await expect(page.getByRole('heading', { name: 'Late notices', level: 2 }).first()).toBeVisible();
}

test('the run plans a notice for a Miner who is behind, and shows the mail', async ({ page }) => {
  await openRun(page);
  const panel = page.getByRole('tabpanel', { name: 'Late notices' });
  await expect(panel).toContainText('1 to send');
  await expect(
    panel.getByRole('checkbox', { name: `${MINER.cora.name} · ${isk(book.cora.owed)}` })
  ).toBeChecked();
  const preview = page.getByRole('region', { name: 'Mail preview' });
  await expect(preview).toContainText(`To: ${MINER.cora.name}`);
  await expect(preview).toContainText(
    `You owe ${isk(book.cora.owed)} ISK for ${book.cora.days} days`
  );
  // One code per Miner, whichever notice it rides on.
  await expect(preview).toContainText(`put ${minerPaymentCode(solo(MINER.cora.id))} in the reason`);
});

/** Issues the run's one planned notice (Cora's) and returns it as stored, with its verify token. */
async function issueCorasNotice(page: Page) {
  await openRun(page);
  await page.getByRole('button', { name: 'Continue to send' }).click();
  await page.getByRole('button', { name: 'Send 1 late notice' }).click();
  const cora = solo(MINER.cora.id);
  let issued: { id: string; listed: unknown } | undefined;
  await expect
    .poll(async () => {
      const notices = await readCollection(`corps/${CORP}/lateNotices`);
      const found = [...notices].find(([, n]) => n.minerId === cora);
      issued = found && { id: found[0], listed: found[1].listed };
      return issued?.listed;
    })
    .toBe(book.cora.owed);
  const link = await readDoc(`corps/${CORP}/lateNoticeLinks/${issued!.id}`);
  return { id: issued!.id, token: String(link?.token) };
}

test('an officer issues the planned late notice, and it is mailed', async ({ page }) => {
  const notice = await issueCorasNotice(page);
  await expect(
    page
      .getByRole('table', { name: 'Notices sent' })
      .getByRole('row', { name: new RegExp(MINER.cora.name) })
  ).toContainText(`${shortDay(0)}${isk(book.cora.owed)}`);
  // This tab's send queue mails it from the officer's Character and records the mail.
  await expect
    .poll(async () => {
      const stored = await readDoc(`corps/${CORP}/lateNotices/${notice.id}`);
      return (stored?.mail as { sent?: number } | undefined)?.sent;
    })
    .toBe(1);
});

// Once the queue has mailed it and the book recorded the mail, the table still reads "1 of 1 not
// mailed" until the page is reloaded: nothing re-reads the book after `recordMail`.
test.fixme('the Notices sent table shows the notice as mailed once it is sent', async ({
  page,
}) => {
  const notice = await issueCorasNotice(page);
  await expect
    .poll(async () => {
      const stored = await readDoc(`corps/${CORP}/lateNotices/${notice.id}`);
      return (stored?.mail as { sent?: number } | undefined)?.sent;
    })
    .toBe(1);
  await expect(
    page
      .getByRole('table', { name: 'Notices sent' })
      .getByRole('row', { name: new RegExp(MINER.cora.name) })
  ).not.toContainText('not mailed');
});

test('the verify link shows what the Miner owes now, without a login', async ({ page }) => {
  // An officer's visit records each account for the server (it cannot price days itself).
  await signInAsOfficer(page, './corp/moons/miners');
  await expect(page.getByRole('row', { name: new RegExp(MINER.ada.name) })).toBeVisible();
  await page.goto(`./corp-tax-book/verify/${book.tokens.ada}`);
  await expect(page.getByRole('main')).toContainText(isk(book.ada.owed));
});

// The mail asks for the Miner's code (`minerPaymentCode`, lateNoticeMailing.ts), but the verify
// page's Pay section prints the notice's own code (`notice.code`, VerifyPage.tsx): two codes.
test.fixme('the pay section gives the Miner the same code the mail did', async ({ page }) => {
  const notice = await issueCorasNotice(page);
  await page.goto(`./corp-tax-book/verify/${notice.token}`);
  await expect(page.getByRole('main')).toContainText(
    `Reason${minerPaymentCode(solo(MINER.cora.id))}`
  );
});

test('an old-style verify link from before the move still opens', async ({ page }) => {
  await page.goto(`./corp-tax-book/verify/${book.tokens.bram}`);
  await expect(page.getByRole('main')).toContainText(MINER.bram.name);
  await expect(page.getByRole('main')).not.toContainText('This link is not valid');
});

test('a Miner stops reminders from the verify page', async ({ page }) => {
  await page.goto(`./corp-tax-book/verify/${book.tokens.ada}`);
  const stop = page
    .getByRole('switch', { name: 'Stop reminders' })
    .or(page.getByRole('checkbox', { name: 'Stop reminders' }));
  await stop.click();
  await expect(stop).toBeChecked();
  await expect
    .poll(async () => (await readDoc(`corpTaxBookTokens/${book.tokens.ada}`))?.remindersStopped)
    .toBe(true);
});

test("closing a guest's account leaves a final notice for the days no notice listed", async ({
  page,
}) => {
  await signInAsOfficer(page, minerUrl(solo(MINER.guest.id)));
  await expect(page.getByRole('heading', { level: 1, name: MINER.guest.name })).toBeVisible();
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Close account' }).click();
  const dialog = page.getByRole('dialog', { name: `Close ${MINER.guest.name}'s account?` });
  // "Send a final notice" is the default answer to "What they still owe".
  await expect(dialog.getByRole('group', { name: 'What they still owe' })).toContainText(
    'Send a final notice'
  );
  await expect(dialog).toContainText(
    `A final late notice lists ${isk(book.guest.unlisted)} through ${shortDay(book.guest.unlistedThroughBack)}`
  );
  await dialog.getByRole('textbox', { name: /Reason/ }).fill('Guest fleet ended');
  await dialog.getByRole('button', { name: 'Close account' }).click();
  await expect(dialog).toBeHidden();
  await page.goto('./corp/moons/late-notices');
  await expect(
    page.getByRole('checkbox', { name: new RegExp(`^${MINER.guest.name} · `) })
  ).toBeVisible();
});
