/**
 * Balances strip Payee filter button touch target (issue #1055): the button
 * wrapping a Payee's name in the Tax tab's Balances strip had zero
 * height/padding sizing — its hit area was just the text line box, well
 * under the app's 44px touch-target floor (docs/DESIGN.md §3). The fix grows
 * the button to `min-h-11` but cancels the added height with an equal
 * negative vertical margin (`-my-3`) so the row — and the card — don't grow;
 * jsdom has no real layout engine, so only a real browser can confirm the
 * net effect actually nets back to the original row height. `md:` reverts
 * both so desktop is pixel-identical to today.
 *
 * A Payee balance is seeded directly into IndexedDB (payee + assignment +
 * a cached raw ESI mining-ledger row + a cached solar-system name/security
 * row) rather than driven through the ledger/assign UI flow — same
 * raw-`indexedDB` precedent `industryRecordsNarrow.spec.ts` and
 * `support/login.ts`'s `expireCachedEsiRows` use, run only after
 * `loginAndSelectCharacter` so the app's own Dexie schema has already opened
 * the stores. `esiCache` rows are written with a fresh `fetchedAt` so
 * `esi/cache.ts` serves them without ever attempting a live ESI call.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** Real moon ore typeId (Zeolites) already in `public/data/moonOreTypes.json` and `public/data/types.json`, so grouping and name resolution both succeed with no ESI/network call. */
const ORE_TYPE_ID = 45490;
/** Jita — a real solar system id, whose name/security row is pre-seeded below so `loadSystemNameAndSecurity` never has to fetch it live. */
const SOLAR_SYSTEM_ID = 30000142;
const ENTRY_DATE = '2026-01-01';
const PAYEE_ID = 'e2e-payee-1';
const PAYEE_NAME = 'Test Landlord';
const ASSIGNMENT_ID = 'e2e-assignment-1';
const ORE_QUANTITY = 1000;
const TAX_OWED = 100_000;

/** A second Mining Ledger Entry, deliberately left with no Assignment so it reads as Unassigned — the only status `dismissableRows` will bulk-dismiss. Same system, a different date, so `groupMiningLedger` keeps it a row of its own. */
const UNASSIGNED_DATE = '2026-01-02';
/** Four days after the entry it settles: inside `withinLinkWindow`'s asymmetric `[-1, +14]` day window, and after the mining, which is the direction a pilot actually pays in. */
const PAYMENT_DATE = '2026-01-05T12:00:00Z';
const JOURNAL_REF_ID = 7_000_001;

interface SeedOptions {
  /** Also seed `UNASSIGNED_DATE`'s entry — what Bulk Dismiss needs something to dismiss. */
  withUnassignedEntry?: boolean;
  /** Also seed a wallet-journal payment `suggestLink` will offer — what Link Payment needs a suggestion to show. */
  withMadePayment?: boolean;
}

/** `esi/cache.ts`'s character-independent public-lookup sentinel (`GLOBAL_CACHE_CHARACTER_ID`). */
const GLOBAL_CACHE_CHARACTER_ID = 0;

async function seedPayeeBalance(page: Page, options: SeedOptions = {}): Promise<void> {
  await page.evaluate(
    async ({
      characterId,
      globalCacheCharacterId,
      oreTypeId,
      solarSystemId,
      entryDate,
      payeeId,
      payeeName,
      assignmentId,
      oreQuantity,
      taxOwed,
      unassignedDate,
      paymentDate,
      journalRefId,
      withUnassignedEntry,
      withMadePayment,
    }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(
          ['esiCache', 'payees', 'miningTaxAssignments'],
          'readwrite'
        );
        const ledgerRows = [
          {
            date: entryDate,
            quantity: oreQuantity,
            solar_system_id: solarSystemId,
            type_id: oreTypeId,
          },
          ...(withUnassignedEntry
            ? [
                {
                  date: unassignedDate,
                  quantity: oreQuantity,
                  solar_system_id: solarSystemId,
                  type_id: oreTypeId,
                },
              ]
            : []),
        ];
        // Raw ESI mining-ledger row (`getCharacterMining`'s shape), grouped by
        // `groupMiningLedger` into one Mining Ledger Entry for this (date,
        // system) pair.
        tx.objectStore('esiCache').put({
          characterId,
          key: 'miningTax:ledger',
          value: ledgerRows,
          fetchedAt: now,
          truncated: false,
        });
        // One outgoing wallet-journal payment for exactly the balance below,
        // which is all `suggestLink` needs to offer a link at its weakest
        // `amount` tier. `second_party_id` is deliberately omitted: with no
        // counterparty there is no `resolveNames` lookup (and so nothing for
        // `testBase`'s escaped-network guard to catch), and `identityKind`
        // returns null, so the suggestion rests on the figure alone.
        if (withMadePayment) {
          tx.objectStore('esiCache').put({
            characterId,
            key: 'wallet:journal',
            value: [
              {
                id: journalRefId,
                ref_type: 'player_donation',
                // Negative: `fromJournal` only counts ISK *leaving* the wallet.
                amount: -taxOwed,
                date: paymentDate,
              },
            ],
            fetchedAt: now,
            truncated: false,
          });
        }
        // Solar-system name/security, cached under the shared public-lookup
        // sentinel so `resolveRowNames` never calls `/universe/systems/{id}`.
        tx.objectStore('esiCache').put({
          characterId: globalCacheCharacterId,
          key: `system:${solarSystemId}`,
          value: { system_id: solarSystemId, name: 'Jita', security_status: 0.9 },
          fetchedAt: now,
        });
        tx.objectStore('payees').put({
          id: payeeId,
          characterId,
          name: payeeName,
          defaultTaxPct: 10,
          updatedAt: now,
        });
        // Outstanding Assignment covering the whole entry, so `computePayeeBalances`
        // counts its `taxOwed` toward this Payee's balance (`owed > 0`), which is
        // what makes the card show by default without toggling "show settled".
        tx.objectStore('miningTaxAssignments').put({
          id: assignmentId,
          characterId,
          date: entryDate,
          solarSystemId,
          payeeId,
          oreLines: [{ typeId: oreTypeId, quantity: oreQuantity }],
          taxPct: 10,
          estimatedValue: 1_000_000,
          taxOwed,
          status: 'outstanding',
          updatedAt: now,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    {
      characterId: CHARACTER_ID,
      globalCacheCharacterId: GLOBAL_CACHE_CHARACTER_ID,
      oreTypeId: ORE_TYPE_ID,
      solarSystemId: SOLAR_SYSTEM_ID,
      entryDate: ENTRY_DATE,
      payeeId: PAYEE_ID,
      payeeName: PAYEE_NAME,
      assignmentId: ASSIGNMENT_ID,
      oreQuantity: ORE_QUANTITY,
      taxOwed: TAX_OWED,
      unassignedDate: UNASSIGNED_DATE,
      paymentDate: PAYMENT_DATE,
      journalRefId: JOURNAL_REF_ID,
      withUnassignedEntry: options.withUnassignedEntry ?? false,
      withMadePayment: options.withMadePayment ?? false,
    }
  );
}

test.describe('Balances strip Payee filter button — touch target', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSelectCharacter(page);
    await seedPayeeBalance(page);
  });

  test('grows to 44px on phone without growing the row it sits in', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./moon-mining');

    const button = page.getByRole('button', { name: `Show only ${PAYEE_NAME}'s entries` });
    await expect(button).toBeVisible();

    const { buttonHeight, rowHeight } = await button.evaluate((el) => ({
      buttonHeight: el.getBoundingClientRect().height,
      rowHeight: el.parentElement!.getBoundingClientRect().height,
    }));

    expect(buttonHeight).toBeGreaterThanOrEqual(44);
    // Proves the extra height comes from the button's own box/negative-margin
    // trick, not from the row (and thus the card) genuinely growing to fit
    // it: pinned near text-sm's own 20px line-height, not just "under 44".
    expect(rowHeight).toBeGreaterThan(15);
    expect(rowHeight).toBeLessThan(25);
  });

  test('stays small above md — desktop is unchanged', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./moon-mining');

    const button = page.getByRole('button', { name: `Show only ${PAYEE_NAME}'s entries` });
    await expect(button).toBeVisible();

    const buttonHeight = await button.evaluate((el) => el.getBoundingClientRect().height);
    // Same text-sm 20px line-height as the phone row height, +/- rendering
    // slack — not just "small", pinned to what `md:my-0 md:min-h-0` reverts to.
    expect(buttonHeight).toBeGreaterThan(15);
    expect(buttonHeight).toBeLessThan(25);
  });
});

/**
 * Mining Tax dialog entry rows — touch target (issue #1144): the `<label>`
 * wrapping each include/exclude checkbox in Settle Up, Link Payment and Bulk
 * Dismiss is the row's whole tap target, and at `px-2 py-1.5 text-xs` it
 * measured 28px — a pointer-sized row reused verbatim on a phone, which
 * docs/DESIGN.md §3 rules out. The fix applies `tappableRowClassName`
 * (`min-h-11 md:min-h-7`, `controlStyles.ts`), so the row grows to the 44px
 * floor on a phone and reverts to exactly its old 28px above `md`. jsdom has
 * no layout engine, so only a real browser can tell 44 from 28 — hence a
 * Playwright spec rather than a unit test.
 *
 * Each dialog needs different state, so `seedPayeeBalance` grew two opt-in
 * extras rather than a second seeding pattern:
 *
 * - **Settle Up** needs only the Payee balance the block above already seeds.
 * - **Link Payment**'s "covered entries" sub-list renders only once a
 *   suggestion is selected — and `LinkPaymentDialog` pre-selects the first
 *   one, so seeding a single outgoing wallet-journal payment for exactly the
 *   balance owed is enough; no radio click is involved.
 * - **Bulk Dismiss** acts on Unassigned rows only, so a second ledger entry
 *   is seeded with no Assignment against it.
 *
 * Rows are ticked through the table's real checkbox column and the real
 * selection toolbar rather than by poking state, because "can this even be
 * opened at 390px?" is half of what the fix has to survive.
 */
test.describe('Mining Tax dialog entry rows — touch target', () => {
  const INCLUDE_LABEL = (date: string) => `Include ${date}`;

  /** The tap target is the `<label>`, not the checkbox the accessible name hangs off — so anchor on the input and measure its wrapper. */
  function rowHeight(dialog: Locator, date: string): Promise<number> {
    return dialog
      .getByLabel(INCLUDE_LABEL(date))
      .evaluate((el) => el.closest('label')!.getBoundingClientRect().height);
  }

  async function openSettleUp(page: Page): Promise<Locator> {
    // Exact: the selection toolbar's own action is "Settle up {{count}}".
    await page.getByRole('button', { name: 'Settle up', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Settle up — ${PAYEE_NAME}` });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async function openLinkPayment(page: Page): Promise<Locator> {
    // The card appears only once `loadMadePayments` resolves — it is loaded
    // after the ledger on purpose, so this waits rather than clicking blind.
    const review = page.getByRole('button', { name: 'Review' });
    await expect(review).toBeVisible();
    await review.click();
    const dialog = page.getByRole('dialog', { name: 'Link a payment you already made' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async function openBulkDismiss(page: Page): Promise<Locator> {
    // Ticking both selectable rows is deliberate: only the Unassigned one is
    // dismissable, so the count in the button is itself the check that
    // `dismissableRows` narrowed the selection the way the toolbar claims.
    // `.all()` resolves against whatever is in the DOM right now and never
    // waits, so the count — one Outstanding row plus one Unassigned — is what
    // holds until the table has actually rendered.
    const boxes = page.getByLabel('Select this row');
    await expect(boxes).toHaveCount(2);
    for (const box of await boxes.all()) await box.check();
    const dismiss = page.getByRole('button', { name: 'Dismiss 1' });
    await expect(dismiss).toBeEnabled();
    await dismiss.click();
    const dialog = page.getByRole('dialog', { name: 'Dismiss entries' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test('Settle Up: itemized entry row reaches 44px on phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await loginAndSelectCharacter(page);
    await seedPayeeBalance(page);
    await page.goto('./moon-mining');

    const dialog = await openSettleUp(page);
    expect(await rowHeight(dialog, ENTRY_DATE)).toBeGreaterThanOrEqual(44);
  });

  test('Link Payment: covered-entry row reaches 44px on phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await loginAndSelectCharacter(page);
    await seedPayeeBalance(page, { withMadePayment: true });
    await page.goto('./moon-mining');

    const dialog = await openLinkPayment(page);
    expect(await rowHeight(dialog, ENTRY_DATE)).toBeGreaterThanOrEqual(44);
  });

  test('Bulk Dismiss: itemized entry row reaches 44px on phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await loginAndSelectCharacter(page);
    await seedPayeeBalance(page, { withUnassignedEntry: true });
    await page.goto('./moon-mining');

    const dialog = await openBulkDismiss(page);
    expect(await rowHeight(dialog, UNASSIGNED_DATE)).toBeGreaterThanOrEqual(44);
  });

  test('all three stay at their old height above md — desktop is unchanged', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await loginAndSelectCharacter(page);
    await seedPayeeBalance(page, { withUnassignedEntry: true, withMadePayment: true });
    await page.goto('./moon-mining');

    // One line of `text-xs` (16px) inside `py-1.5` (2 x 6px) is 28px — what
    // `md:min-h-7` reverts to exactly. Pinned as a range rather than asserted
    // "under 44" so a row that quietly grew for some other reason still fails.
    const expectUnchanged = (height: number) => {
      expect(height).toBeGreaterThan(24);
      expect(height).toBeLessThan(32);
    };

    const settleUp = await openSettleUp(page);
    expectUnchanged(await rowHeight(settleUp, ENTRY_DATE));
    await page.keyboard.press('Escape');
    await expect(settleUp).toBeHidden();

    const linkPayment = await openLinkPayment(page);
    expectUnchanged(await rowHeight(linkPayment, ENTRY_DATE));
    await page.keyboard.press('Escape');
    await expect(linkPayment).toBeHidden();

    const bulkDismiss = await openBulkDismiss(page);
    expectUnchanged(await rowHeight(bulkDismiss, UNASSIGNED_DATE));
  });
});

/**
 * `SelectionToolbar`'s bulk "Settle Up" touch target (issue #1175): the
 * bar's one primary, decision-committing action for the whole checked
 * selection rendered at `size="sm"` (36px) like its four ordinary secondary
 * siblings (Select All, Clear, Combine, Dismiss) — under this app's `md`
 * touch tier (44px), the accepted size for a page's sole primary control
 * (`FilterBar`'s sheet Apply/Cancel precedent). Only Settle Up moves; the
 * other four stay `sm` at every width, since widening them too would grow
 * four already-conventional secondary actions on desktop pointer for no
 * phone-specific reason (RUBRIC.md's "the desktop layout is the control").
 *
 * A row is ticked through the table's real checkbox column, not by poking
 * state — the toolbar itself only renders once something is checked, so
 * "does the bar even reach 44px once it's actually showing on a phone?" is
 * the property under test, the same reasoning the dialog-row spec above
 * gives for driving its own checkboxes for real.
 */
test.describe('Mining Tax bulk Settle Up — touch target', () => {
  /** Lands on the Tax tab with exactly one row checked, so the toolbar is showing and its Settle Up/Clear heights are ready to measure. */
  async function openToolbarWithOneRowChecked(
    page: Page,
    viewport: { width: number; height: number }
  ) {
    await page.setViewportSize(viewport);
    await loginAndSelectCharacter(page);
    await seedPayeeBalance(page);
    await page.goto('./moon-mining');

    const boxes = page.getByLabel('Select this row');
    await expect(boxes).toHaveCount(1);
    await boxes.first().check();

    const settleUp = page.getByRole('button', { name: /^Settle up \d+$/ });
    await expect(settleUp).toBeVisible();
    return {
      settleUpHeight: async () => (await settleUp.boundingBox())?.height,
      clearHeight: async () =>
        (await page.getByRole('button', { name: 'Clear' }).boundingBox())?.height,
    };
  }

  test('Settle Up reaches 44px on phone once the bar is showing', async ({ page }) => {
    const heights = await openToolbarWithOneRowChecked(page, PHONE);
    expect(await heights.settleUpHeight()).toBeGreaterThanOrEqual(44);

    // Select All/Clear stay at the ordinary `sm` size — widening them too
    // isn't this ticket's fix.
    expect(await heights.clearHeight()).toBeLessThan(40);
  });

  test('desktop changes only Settle Up, to 36px — a deliberate, narrow exception', async ({
    page,
  }) => {
    const heights = await openToolbarWithOneRowChecked(page, DESKTOP);
    // `md` tier's own pointer-width value (`h-9`), not the 44px touch value —
    // this is the one accepted pointer-size change the ticket calls for.
    expect(await heights.settleUpHeight()).toBeCloseTo(36, 0);
    // Clear's own `sm` pointer value is untouched.
    expect(await heights.clearHeight()).toBeCloseTo(28, 0);
  });
});
