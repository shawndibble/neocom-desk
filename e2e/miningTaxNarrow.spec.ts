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
import type { Page } from '@playwright/test';
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

/** `esi/cache.ts`'s character-independent public-lookup sentinel (`GLOBAL_CACHE_CHARACTER_ID`). */
const GLOBAL_CACHE_CHARACTER_ID = 0;

async function seedPayeeBalance(page: Page): Promise<void> {
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
        // Raw ESI mining-ledger row (`getCharacterMining`'s shape), grouped by
        // `groupMiningLedger` into one Mining Ledger Entry for this (date,
        // system) pair.
        tx.objectStore('esiCache').put({
          characterId,
          key: 'miningTax:ledger',
          value: [
            {
              date: entryDate,
              quantity: oreQuantity,
              solar_system_id: solarSystemId,
              type_id: oreTypeId,
            },
          ],
          fetchedAt: now,
          truncated: false,
        });
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
