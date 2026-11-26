/**
 * D13: V4 "Running a corp: the officer's side". Needs the Firebase emulators (auth, firestore, functions) and a
 * Vite with VITE_FIREBASE_EMULATORS=1 on port 5174. Sub-takes: D13-a board/structures/members, D13-b1 member
 * files a claim, D13-b2 officer queue, D13-c vetting, D13-d tax book, D13-e the miner's verify page.
 */
import { test, type Page } from '@playwright/test';
import { hideSandboxNoise } from '../../recorder';
import { openWorld } from '../world';
import { installHalcyonEsi } from '../mocks/D13-esi';
import { installCallables, fileMiraClaim } from '../mocks/D13-callables';
import { seedHalcyon, type SeedResult } from '../mocks/D13-seed';
import { record } from '../mocks/D13-rec';

test.use({ baseURL: 'http://localhost:5174/' });
test.setTimeout(600_000);

async function open(page: Page, path: string, active: 'arden' | 'mira' = 'arden'): Promise<SeedResult> {
  const seeded = await seedHalcyon();
  await hideSandboxNoise(page);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await openWorld(page, path, {
    active,
    before: async (p) => {
      await installHalcyonEsi(p);
      await installCallables(p);
      let mailId = 481_220_000;
      await p.route(/esi\.evetech\.net\/.*characters\/\d+\/mail\/?(\?.*)?$/, async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        await route.fulfill({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: String(mailId++) });
      });
    },
  });
  await page.waitForTimeout(12_000);
  return seeded;
}

test('D13-a board, structures, members', async ({ page }) => {
  await open(page, './corp');
  const nav = (name: string) => page.getByRole('link', { name, exact: true }).first();
  await record(page, 'D13-a', async (t) => {
    await t.hold(2000);
    t.mark('board-open', 'Corp Board: Due soon, Structures, Moon extractions, Corp industry jobs, wallet');
    await t.hold(4000);
    t.mark('board-due-soon', 'Due soon: every deadline (fuel, timers, moon chunks, jobs) ordered by time left');
    await t.hover(page.getByText(/Lantern Drill Tatara/).first());
    await t.hold(4500);
    await t.hover(page.getByText(/Halcyon Forge Athanor/).first());
    await t.hold(3500);
    t.mark('board-structures', 'Structures widget: fuel left per structure and the reinforcement timer');
    await t.hover(page.getByText('armor reinforce').first());
    await t.hold(4500);
    t.mark('board-moon-chunks', 'Moon extractions: chunk arrival countdowns');
    await t.hover(page.getByText(/Cinder Vault Athanor/).first());
    await t.hold(4500);
    t.mark('board-jobs', 'Corp industry jobs: ready and running with time left');
    await t.hover(page.getByText('Hurricane ×5').first());
    await t.hold(4500);
    // Corporation scope.
    t.mark('board-scope-open', 'Scope picker open: this character, all, or one corporation');
    await t.glidePoint(1197, 34);
    await t.clickPoint(1197, 34);
    await t.hold(4000);
    await t.click(page.getByRole('menuitemradio', { name: 'Lantern Freight Cooperative' }));
    t.mark('board-corp-lfc', 'Board narrowed to the second corporation');
    await t.settle();
    await t.hold(4500);
    await t.glidePoint(1197, 34);
    await t.clickPoint(1197, 34);
    await t.hold(2500);
    await t.click(page.getByRole('menuitemradio', { name: 'Halcyon Forge Industries' }));
    t.mark('board-corp-hfind', 'Back on Halcyon Forge Industries');
    await t.settle();
    await t.hold(4500);

    // Structures.
    await t.click(nav('Structures'));
    t.mark('structures-open', 'Structures: fuel days left, state, services');
    await t.settle(4000);
    await t.hold(4500);
    await t.hover(page.getByText('2 online').first());
    t.mark('structures-services', 'Services per structure, an offline one in red');
    await t.hold(4500);
    const fuel = page.locator('input[type=date]').first();
    const box = (await fuel.boundingBox())!;
    await t.glidePoint(box.x + 22, box.y + box.height / 2);
    await t.clickPoint(0, 0);
    await t.hold(600);
    await t.type('01102027');
    t.mark('structures-fuel-until', 'Fuel until a date: blocks needed per structure and the total');
    await t.hold(5000);
    const copy = page.getByRole('button', { name: /copy list/i });
    await t.click(copy);
    t.mark('structures-copy-list', 'Copy list clicked: shopping list copied');
    await t.hold(4500);

    // Members.
    await t.click(nav('Members'));
    t.mark('members-open', 'Members roster');
    await t.settle(4000);
    await t.hold(4500);
    await t.click(page.getByRole('columnheader', { name: /last seen/i }));
    await t.hold(1500);
    t.mark('members-silence', 'Roster sorted by Last seen: longest silence');
    await t.hold(5000);
    await t.click(page.getByRole('tab', { name: 'Roles' }));
    t.mark('members-roles', 'Roles audit: sensitive roles per member');
    await t.settle(3000);
    await t.hold(5000);
    await t.scrollBy(500);
    t.mark('members-role-changes', 'Role changes in the last 30 days');
    await t.hold(5000);
  });
});

test('D13-b1 member files a claim', async ({ page }) => {
  await open(page, './srp', 'mira');
  await record(page, 'D13-b1', async (t) => {
    await t.hold(2000);
    t.mark('srp-member-open', 'Member SRP page: file a claim, pick a lost ship, My claims');
    await t.hold(4000);
    const fileButton = page.getByRole('row').filter({ hasText: 'Drake' }).getByRole('button').first();
    await t.hover(page.getByText('Drake').first());
    t.mark('srp-lost-ship', 'The pilot\'s own loss listed from their killmails');
    await t.hold(4000);
    await t.click(fileButton);
    t.mark('srp-file-dialog', 'File dialog: the loss checked against the doctrine fit before filing');
    await t.settle(2500);
    await t.hold(4500);
    await t.hover(page.getByText(/Fit checked against/));
    await t.hold(3000);
    const confirm = page.getByRole('button', { name: /file claim/i }).last();
    await t.click(confirm);
    t.mark('srp-claim-filed', 'Claim filed: it appears under My claims as pending');
    await t.settle(3000);
    await t.hold(5000);
  });
});

test('D13-b2 officer queue', async ({ page }) => {
  await open(page, './corp/srp');
  await fileMiraClaim();
  await page.reload();
  await page.waitForTimeout(8000);
  const row = (name: string) => page.getByRole('row').filter({ hasText: name });
  await record(page, 'D13-b2', async (t) => {
    await t.hold(2000);
    t.mark('queue-open', 'SRP officer queue: pending claims with amount and doctrine result');
    await t.hold(4500);
    await t.hover(row('Kaelen Voss').first());
    await t.hold(3500);
    await t.hover(page.getByText('Off doctrine').first());
    t.mark('queue-off-doctrine', 'One claim is flagged Off doctrine');
    await t.hold(4500);
    await t.click(row('Thessaly Crane').getByText('Drake').first());
    t.mark('queue-claim-detail', 'The claim opened: killmail fit checked against the doctrine fit');
    await t.settle(2500);
    await t.hold(5500);
    await t.hover(page.getByText('Warp Scrambler II').first());
    await t.hold(3500);
    await page.keyboard.press('Escape');
    await t.hold(2000);
    // Approve the claim that passes, one by one.
    await t.click(row('Mira Voskane').getByRole('button', { name: /^approve/i }));
    t.mark('queue-approve-one', 'Approve on a doctrine-matching claim');
    await t.settle(2500);
    await t.hold(4000);
    // Then the rest that pass, in one go.
    for (const name of ['Kaelen Voss', 'Odalys Venn', 'Oriel Tanvar', 'Wystan Pryce']) {
      await t.click(row(name).getByRole('checkbox'), 800);
      await t.hold(700);
    }
    t.mark('queue-select', 'Four passing claims ticked; the off-doctrine one left out');
    await t.hold(3500);
    await t.click(page.getByRole('button', { name: /^approve \(\d+\)/i }).first());
    t.mark('queue-approve-bulk', 'Bulk approve: confirm dialog with the total');
    await t.hold(4000);
    await t.click(page.getByRole('button', { name: 'Approve', exact: true }).last());
    await t.settle(3000);
    await t.hold(4000);
    await t.click(page.getByRole('tab', { name: /^owed/i }));
    t.mark('queue-owed', 'Owed tab: approved claims waiting to be paid');
    await t.settle(2500);
    await t.hold(4500);
    await t.click(page.getByRole('button', { name: /select all/i }).first());
    t.mark('queue-owed-select', 'All owed claims ticked for payment');
    await t.hold(4000);
    await t.click(page.getByRole('button', { name: /mark.*paid.*\(\d+\)|pay.*\(\d+\)/i }).first());
    t.mark('queue-pay-bulk', 'Bulk pay: confirm dialog marking the owed claims paid in one go');
    await t.hold(4000);
    await t.click(page.getByRole('button', { name: 'Mark paid', exact: true }).last());
    await t.settle(3000);
    await t.hold(3000);
    await t.click(page.getByRole('tab', { name: /^history/i }));
    t.mark('queue-history', 'History: the claims now paid');
    await t.settle(2500);
    await t.hold(5000);
  });
});

test('D13-c vetting', async ({ page }) => {
  await open(page, './corp/vetting');
  await record(page, 'D13-c', async (t) => {
    await t.hold(2000);
    t.mark('vetting-open', 'Vetting: open reviews with flags and sign-offs');
    await t.hold(4500);
    await t.click(page.getByRole('button', { name: /copy apply link/i }));
    t.mark('vetting-apply-link', 'Copy apply link clicked: the link is copied');
    await t.hold(4500);
    // What an applicant sees at that link (a plain navigation: the link is /apply/<corporation id>).
    await page.goto('./apply/98000001');
    await page.getByText(/Welcome\. Add every character/).waitFor({ timeout: 30_000 });
    t.mark('vetting-apply-page', 'The public apply page the link opens, no login needed to read it');
    await t.settle(1000);
    await t.hold(5000);
    await page.goto('./corp/vetting');
    await t.settle(3000);
    await t.click(page.getByText('Aldric Thorne').first());
    t.mark('vetting-report', 'An applicant\'s report with what was flagged');
    await t.settle(4000);
    await t.hold(5000);
    const toggle = page.getByText(/rows behind this/i).first();
    await t.click(toggle);
    await t.hold(2000);
    await t.click(toggle);
    t.mark('vetting-flag-evidence', 'The flag opened to the rows behind it: dates, counterparties, amounts');
    await t.hold(6000);
    await t.hover(page.getByText('Blackwater Reavers').first());
    await t.hold(4500);
  });
});

test('D13-d tax book', async ({ page }) => {
  await open(page, './corp/moons');
  const nav = (name: string) => page.getByRole('link', { name, exact: true }).first();
  await record(page, 'D13-d', async (t) => {
    await t.hold(2000);
    t.mark('taxbook-open', 'Corp Tax Book (Moons): owed, late notices due, moons by state');
    await t.hold(5000);
    await t.click(nav('Miners'));
    t.mark('taxbook-miners', 'Miners: what each owes, overdue days and last paid');
    await t.settle(3000);
    await t.hold(5000);
    await t.click(page.getByText('Casimir Vael').first());
    t.mark('taxbook-miner-account', 'Casimir Vael\'s running account: days mined, tax, payments matched');
    await t.settle(3500);
    await t.hold(5500);
    await t.click(page.getByRole('row').filter({ hasText: 'Payment from Casimir Vael' }).first());
    t.mark('taxbook-payment-matched', 'A payment row opened: the donation matched to this miner and the days it paid');
    await t.settle(1500);
    await t.hold(5000);
    await t.click(nav('Late notices'));
    t.mark('late-open', 'Late notices: three miners behind the notice rules, mail preview alongside');
    await t.settle(3500);
    await t.hold(5500);
    await t.click(page.getByRole('button', { name: /edit mail/i }));
    t.mark('late-edit', 'Edit mail: the officer\'s own wording replaces the standard text');
    await t.settle(1500);
    await t.hold(3000);
    await t.click(page.getByText(/^Hi Casimir Vael/).first());
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await t.type("Short on ISK this week? Reply to this mail and we'll sort out a plan.");
    t.mark('late-edited', 'The mail reworded by the officer before it goes out');
    await t.hold(4500);
    await t.click(page.getByRole('button', { name: /continue to send/i }));
    t.mark('late-send-step', 'Send step: what will be issued and queued as in-game mail');
    await t.settle(2500);
    await t.hold(4500);
    await t.click(page.getByRole('button', { name: /send 3 late notices/i }));
    t.mark('late-sent', 'Notices issued; mails queued, progress chip in the header');
    await t.settle(3000);
    await t.hold(5000);
    await t.hold(32_000);
    t.mark('late-mailed', 'Queue finished: each miner shows the notice as sent');
    await t.hold(4500);
    await t.click(page.getByRole('button', { name: /late notice mail/i }).first());
    t.mark('late-queue-panel', 'Mail queue panel: all three mails sent, each logged on its miner');
    await t.settle(2000);
    await t.hold(4500);
  });
});

test('D13-e miner verify page', async ({ page }) => {
  const seeded = await open(page, './corp/moons');
  await page.goto(`.${seeded.verifyUrl}`);
  await page.getByText(/late notice/i).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(6000);
  await record(page, 'D13-e', async (t) => {
    await t.hold(2500);
    t.mark('verify-open', "The miner's own page from the mail link: late notice, owed now, how to pay with the reason code");
    await t.hold(4500);
    await t.hover(page.getByText(/^MT[A-Z0-9]{6}$/).first());
    t.mark('verify-reason', 'The reason code that links a payment to this miner');
    await t.hold(4000);
    await t.click(page.getByText(/every day and payment/i).first());
    t.mark('verify-ledger', 'Ledger opened: every day and payment, no sign-in needed');
    await t.settle(1500);
    await t.hold(5000);
  });
});
