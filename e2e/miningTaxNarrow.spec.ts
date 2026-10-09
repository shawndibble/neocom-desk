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
import { signInAndGoto } from './support/authSeed';
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
  /** Seed the Assignment with a zero value and zero tax, so its row has nothing to show in the value and tax columns. */
  withZeroValue?: boolean;
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
      zeroValue,
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
          estimatedValue: zeroValue ? 0 : 1_000_000,
          taxOwed: zeroValue ? 0 : taxOwed,
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
      zeroValue: options.withZeroValue ?? false,
      unassignedDate: UNASSIGNED_DATE,
      paymentDate: PAYMENT_DATE,
      journalRefId: JOURNAL_REF_ID,
      withUnassignedEntry: options.withUnassignedEntry ?? false,
      withMadePayment: options.withMadePayment ?? false,
    }
  );
}

// Re-seeds the same fixture with `options.payeeName` in place of the module's
// `PAYEE_NAME`, since `seedPayeeBalance` closes over the constant directly.
async function seedPayeeBalanceNamed(page: Page, payeeName: string): Promise<void> {
  await seedPayeeBalance(page);
  await page.evaluate(
    async ({ payeeId, payeeName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('payees', 'readwrite');
        const store = tx.objectStore('payees');
        const getRequest = store.get(payeeId);
        getRequest.onsuccess = () => {
          store.put({ ...getRequest.result, name: payeeName });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { payeeId: PAYEE_ID, payeeName }
  );
}

test.describe('Balances strip Payee filter button — touch target', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndGoto(page);
    await seedPayeeBalance(page);
  });

  test('grows to 44px on phone without growing the row it sits in', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./mining/tax');

    const button = page.getByRole('button', { name: `Show only ${PAYEE_NAME}'s entries` });
    await expect(button).toBeVisible();

    const { buttonHeight, rowHeight } = await button.evaluate((el) => ({
      buttonHeight: el.getBoundingClientRect().height,
      rowHeight: el.parentElement!.getBoundingClientRect().height,
    }));

    expect(buttonHeight).toBeGreaterThanOrEqual(44);
    // Proves the extra height comes from the button's own box/negative-margin
    // trick, not from the row (and thus the card) genuinely growing to fit
    // it: pinned near the owed figure's own 28px (text-lg) line-height, the
    // tallest thing the row holds besides the button, not just "under 44".
    expect(rowHeight).toBeGreaterThan(20);
    expect(rowHeight).toBeLessThan(32);
  });

  test('stays small above md — desktop is unchanged', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./mining/tax');

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
    await page.getByRole('button', { name: 'Settle up…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Settle up — ${PAYEE_NAME}` });
    await expect(dialog).toBeVisible();
    // A single entry starts folded into its summary line; the itemized row
    // under test is one tap away.
    await dialog.getByRole('button', { name: /^1 entry ·/ }).click();
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
    await signInAndGoto(page);
    await seedPayeeBalance(page);
    await page.goto('./mining/tax');

    const dialog = await openSettleUp(page);
    expect(await rowHeight(dialog, ENTRY_DATE)).toBeGreaterThanOrEqual(44);
  });

  test('Link Payment: covered-entry row reaches 44px on phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page);
    await seedPayeeBalance(page, { withMadePayment: true });
    await page.goto('./mining/tax');

    const dialog = await openLinkPayment(page);
    expect(await rowHeight(dialog, ENTRY_DATE)).toBeGreaterThanOrEqual(44);
  });

  test('Bulk Dismiss: itemized entry row reaches 44px on phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page);
    await seedPayeeBalance(page, { withUnassignedEntry: true });
    await page.goto('./mining/tax');

    const dialog = await openBulkDismiss(page);
    expect(await rowHeight(dialog, UNASSIGNED_DATE)).toBeGreaterThanOrEqual(44);
  });

  test('all three stay at their old height above md — desktop is unchanged', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAndGoto(page);
    await seedPayeeBalance(page, { withUnassignedEntry: true, withMadePayment: true });
    await page.goto('./mining/tax');

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
 * Ledger table phone sort picker (issue #2148): `DataTable` defaults to
 * `responsive="stack"` below `sm`, which hides the `<thead>` and its sort
 * buttons entirely — the same bug class already fixed for Industry (#1627),
 * Market (#1628) and Contacts (#1978). The Tax tab renders `DataTableSortPicker`
 * in its filter row on a phone (every column already carries `sortValue`),
 * so this only needs to prove the picker renders on phone, is absent on
 * desktop, and actually reorders the stacked cards.
 */
test.describe('Tax ledger — phone sort picker', () => {
  test('reorders the stacked cards at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page);
    await seedPayeeBalance(page, { withUnassignedEntry: true });
    await page.goto('./mining/tax');

    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    const keysOf = () =>
      table
        .locator('tbody tr[data-row-key]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-key')));

    // Default sort is date desc, so the newer Unassigned row (2026-01-02)
    // leads the older Outstanding row (2026-01-01).
    const unassignedKey = `${CHARACTER_ID}:${UNASSIGNED_DATE}:${SOLAR_SYSTEM_ID}:unassigned`;
    await expect.poll(keysOf).toEqual([unassignedKey, ASSIGNMENT_ID]);

    const sortBy = page.getByLabel('Sort by', { exact: true });
    await expect(sortBy).toBeAttached();
    await sortBy.selectOption({ label: 'Date ↑' });
    await expect.poll(keysOf).toEqual([ASSIGNMENT_ID, unassignedKey]);
  });

  test('no picker at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInAndGoto(page);
    await seedPayeeBalance(page);
    await page.goto('./mining/tax');

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByLabel('Sort by', { exact: true })).toBeHidden();
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
    await signInAndGoto(page);
    await seedPayeeBalance(page);
    await page.goto('./mining/tax');

    const boxes = page.getByLabel('Select this row');
    await expect(boxes).toHaveCount(1);
    await boxes.first().check();

    const settleUp = page.getByRole('button', { name: /^Settle up \d+…$/ });
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

/** Left/top/right/bottom of a cell's text (not the cell's padded box), by the cell's class. */
async function textRect(row: Locator, cellSelector: string) {
  return row
    .locator(cellSelector)
    .first()
    .evaluate((cell) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const { left, top, right, bottom } = range.getBoundingClientRect();
      return { left, top, right, bottom };
    });
}

test.describe('Mining Tax phone card — tick box on the date line (#2983)', () => {
  // A coarse pointer grows the tick box's label to 44px (`touch:size-11`).
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('tick box shares the date line, line two starts under it, nothing overflows', async ({
    page,
  }) => {
    await signInAndGoto(page);
    await seedPayeeBalance(page);
    await page.goto('./mining/tax');

    const box = page.getByLabel('Select this row');
    await expect(box).toHaveCount(1);
    const row = page.locator('tr', { has: box });
    const boxRect = (await box.boundingBox())!;
    const labelRect = (await box.locator('xpath=ancestor::label[1]').boundingBox())!;
    const date = await textRect(row, 'td.dt-primary');
    const lineTwo = await textRect(row, 'td.dt-meta-first');
    const status = await textRect(row, 'td.dt-edge-end');

    // Date and box on one line, a small gap between them.
    const boxMid = boxRect.y + boxRect.height / 2;
    expect(Math.abs(boxMid - (date.top + date.bottom) / 2)).toBeLessThanOrEqual(6);
    const gap = date.left - (boxRect.x + boxRect.width);
    expect(gap).toBeGreaterThanOrEqual(4);
    expect(gap).toBeLessThanOrEqual(12);
    // Line two sits under the box, at the card's left edge, not indented to the date.
    expect(lineTwo.top).toBeGreaterThanOrEqual(date.bottom - 2);
    expect(Math.abs(lineTwo.left - boxRect.x)).toBeLessThanOrEqual(2);
    // The status joins line two when it fits.
    expect(Math.abs(status.top - lineTwo.top)).toBeLessThanOrEqual(6);
    // The touch target still meets the floor, without the box's own cell carrying it.
    expect(labelRect.width).toBeGreaterThanOrEqual(44);
    expect(labelRect.height).toBeGreaterThanOrEqual(44);
    // And nothing pushes the page sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('Mining Tax table row — tick box clears the date (#2983)', () => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    test(`gap between the box and the date at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signInAndGoto(page);
      await seedPayeeBalance(page);
      await page.goto('./mining/tax');

      const box = page.getByLabel('Select this row');
      await expect(box).toHaveCount(1);
      const row = page.locator('tr', { has: box });
      const boxRect = (await box.boundingBox())!;
      const date = await textRect(row, 'td.dt-primary');
      const rowRect = (await row.boundingBox())!;

      expect(date.left - (boxRect.x + boxRect.width)).toBeGreaterThanOrEqual(8);
      // Little room left of the box.
      expect(boxRect.x - rowRect.x).toBeLessThanOrEqual(12);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

/**
 * Ledger table Payee column — long name overflow (issue #2147): a Payee name
 * long enough to fill the column was pushing Status and the row's edit
 * affordance off-screen at 1024px, the narrowest width the table's `md:`
 * layout (not the phone stacked-card) has to support. The fix truncates the
 * `payee` column (the one flexible column of a fixed-layout table, so it
 * takes what the others leave and truncates past that) with an ellipsis, same shape as
 * Market's `location` column/`LocationCell`, so the full name stays
 * discoverable via the app's `Tooltip` rather than being lost outright.
 */
test.describe('Mining Tax ledger — long Payee name overflow', () => {
  const LONG_PAYEE_NAME = 'A Very Long Corporation Holding Name Ltd';
  const NARROW_DESKTOP = { width: 1024, height: 768 };
  const WIDE_DESKTOP = { width: 1440, height: 900 };

  test('Status column and edit affordance stay on-screen at 1024px with a long Payee name', async ({
    page,
  }) => {
    await page.setViewportSize(NARROW_DESKTOP);
    await signInAndGoto(page);
    await seedPayeeBalanceNamed(page, LONG_PAYEE_NAME);
    await page.goto('./mining/tax');

    const statusHeader = page.getByRole('columnheader', { name: 'Status' });
    await expect(statusHeader).toBeVisible();
    const headerBox = await statusHeader.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox!.x + headerBox!.width).toBeLessThanOrEqual(NARROW_DESKTOP.width);

    const row = page.getByRole('row').filter({ hasText: LONG_PAYEE_NAME });
    const statusCell = row.getByRole('cell').filter({ hasText: 'Outstanding' });
    await expect(statusCell).toBeVisible();
    const cellBox = await statusCell.boundingBox();
    expect(cellBox).not.toBeNull();
    expect(cellBox!.x + cellBox!.width).toBeLessThanOrEqual(NARROW_DESKTOP.width);
  });

  test('short Payee name at 1024px renders unchanged', async ({ page }) => {
    await page.setViewportSize(NARROW_DESKTOP);
    await signInAndGoto(page);
    await seedPayeeBalance(page);
    await page.goto('./mining/tax');

    const statusHeader = page.getByRole('columnheader', { name: 'Status' });
    await expect(statusHeader).toBeVisible();
    const headerBox = await statusHeader.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox!.x + headerBox!.width).toBeLessThanOrEqual(NARROW_DESKTOP.width);

    await expect(page.getByRole('table').getByText(PAYEE_NAME, { exact: true })).toBeVisible();
  });

  test('short Payee name at 1440px renders unchanged', async ({ page }) => {
    await page.setViewportSize(WIDE_DESKTOP);
    await signInAndGoto(page);
    await seedPayeeBalance(page);
    await page.goto('./mining/tax');

    const statusHeader = page.getByRole('columnheader', { name: 'Status' });
    await expect(statusHeader).toBeVisible();
    const headerBox = await statusHeader.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox!.x + headerBox!.width).toBeLessThanOrEqual(WIDE_DESKTOP.width);

    await expect(page.getByRole('table').getByText(PAYEE_NAME, { exact: true })).toBeVisible();
  });
});

test.describe('Mining Tax ledger — zero values read as muted dashes (#3104)', () => {
  async function noOverflow(page: Page) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }

  test.describe('phone', () => {
    test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

    test('a zero-value row prints no "value" affix and a priced row still does', async ({
      page,
    }) => {
      await signInAndGoto(page);
      await seedPayeeBalance(page, { withZeroValue: true });
      await page.goto('./mining/tax');
      const valueCell = page.locator('tbody td[data-label="Est. value"]').first();
      await expect(valueCell).toBeHidden();
      await noOverflow(page);

      await seedPayeeBalance(page);
      await page.goto('./mining/tax');
      const priced = page.locator('tbody td[data-label="Est. value"]').first();
      await expect(priced).toBeVisible();
      expect(await priced.evaluate((td) => getComputedStyle(td, '::after').content)).toContain(
        'value'
      );
    });
  });

  test.describe('desktop', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('a zero tax amount is muted, a positive one stays red', async ({ page }) => {
      await signInAndGoto(page);
      await seedPayeeBalance(page, { withZeroValue: true });
      await page.goto('./mining/tax');
      const tax = page.locator('tbody td[data-label="Tax owed"]').first();
      await expect(tax).toBeVisible();
      await expect(tax).not.toHaveClass(/text-isk-neg/);
      await noOverflow(page);

      await seedPayeeBalance(page);
      await page.goto('./mining/tax');
      await expect(page.locator('tbody td[data-label="Tax owed"]').first()).toHaveClass(
        /text-isk-neg/
      );
    });
  });
});
