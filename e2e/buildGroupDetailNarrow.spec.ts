/**
 * Build Group detail's buy-materials table at 390px (issue #2215, reworked by
 * DESIGN.md §6c restraint): the figures are read across columns, so on a phone
 * it stays a plain table (`responsive="table"`) with the material name pinned
 * (`stickyStart`) and the low-value Volume and Owned columns dropped
 * (`phoneHidden`); the table scrolls inside its own wrapper, never the page.
 *
 * A Rifter Blueprint (typeID 691) member at 20 runs supplies both edge cases:
 * Tritanium's quantity (640,000) is six digits, and only Tritanium has a
 * `market/fuzzwork.co.uk` price in the shared mock (`mockEsi.ts`'s
 * `FUZZWORK_AGGREGATES`) — Pyerite, Mexallon and Isogen come back with no
 * orders, so their rows carry the "No price" warning the still-to-buy column
 * shows.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';
import { expectNoPageOverflow } from './support/overflow';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const GROUP_ID = 'g1';
const GROUP_NAME = 'Test Group';
const GROUP_MATERIALS_LABEL = 'Everything this group needs';

/** Tritanium: the only material `FUZZWORK_AGGREGATES` prices, and the Rifter Blueprint's largest material — six digits at 20 runs. */
const TRITANIUM = 34;
/** Pyerite: unpriced in the shared mock, so its still-to-buy cell carries the warning. */
const PYERITE = 35;

async function seedGroupWithPlan(page: Page): Promise<void> {
  await page.evaluate(
    async ({ characterId, groupId, groupName }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['settings', 'buildPlans'], 'readwrite');
        tx.objectStore('settings').put({
          key: 'sync.industryBuildGroups',
          value: { [characterId]: [{ id: groupId, name: groupName, order: 0 }] },
        });
        tx.objectStore('buildPlans').put({
          id: 'plan-1',
          characterId,
          name: 'Rifter Run',
          blueprintTypeID: 691,
          runs: 20,
          me: 0,
          te: 0,
          facility: 'npcStation',
          rigLevel: 'none',
          security: 'highsec',
          hubId: 'jita',
          buildGroupId: groupId,
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { characterId: CHARACTER_ID, groupId: GROUP_ID, groupName: GROUP_NAME }
  );
}

interface CellBox {
  label: string;
  top: number;
  left: number;
  width: number;
  text: string;
  /** Content wider/taller than the cell's own box — the clipping a paired card's narrower cell can produce that a bounding-box-only check would miss. */
  overflows: boolean;
}

/** One buy-materials row's cells, keyed by `data-row-key` (the material's typeId) — position-independent, since sort order isn't asserted here. */
async function readRow(page: Page, typeId: number): Promise<{ display: string; cells: CellBox[] }> {
  const row = page.locator(
    `table[aria-label="${GROUP_MATERIALS_LABEL}"] tr[data-row-key="${typeId}"]`
  );
  await expect(row).toBeVisible();
  return page.evaluate(
    ({ key, label }) => {
      const table = [...document.querySelectorAll('table')].find(
        (t) => t.getAttribute('aria-label') === label
      )!;
      const row = table.querySelector(`tbody tr[data-row-key="${key}"]`) as HTMLElement;
      const style = getComputedStyle(row);
      const cells = [...row.querySelectorAll(':scope > td')].map((td) => {
        const box = td.getBoundingClientRect();
        return {
          label: td.getAttribute('data-label') ?? '',
          top: box.top,
          left: box.left,
          width: box.width,
          text: (td.textContent ?? '').trim(),
          overflows: td.scrollWidth > td.clientWidth + 1 || td.scrollHeight > td.clientHeight + 1,
        };
      });
      return { display: style.display, cells };
    },
    { key: typeId, label: GROUP_MATERIALS_LABEL }
  );
}

function cellFor(cells: CellBox[], label: string): CellBox {
  const cell = cells.find((c) => c.label === label);
  expect(cell).toBeDefined();
  return cell!;
}

test.describe('Build Group detail — buy-materials table on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndGoto(page);
    await seedGroupWithPlan(page);
  });

  test('stays a table at 390px: Qty and Still to buy shown, Volume and Owned dropped', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`./industry/groups/${GROUP_ID}`);

    const { display, cells } = await readRow(page, TRITANIUM);
    expect(display).toBe('table-row');
    const visible = cells.filter((cell) => cell.width > 0).map((cell) => cell.label);
    expect(visible).toEqual(['Material', 'Qty', 'Still to buy']);

    // The six-digit case: Qty still holds its own figure without clipping it.
    const qty = cellFor(cells, 'Qty');
    expect(qty.text).toContain('640,000');
    expect(qty.overflows).toBe(false);

    await expectNoPageOverflow(page);
  });

  test('shows the unpriced warning on an unpriced material at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`./industry/groups/${GROUP_ID}`);

    const { cells } = await readRow(page, PYERITE);
    const row = page.locator(
      `table[aria-label="${GROUP_MATERIALS_LABEL}"] tr[data-row-key="${PYERITE}"]`
    );
    await expect(row.getByText('No price')).toBeVisible();

    const stillToBuy = cellFor(cells, 'Still to buy');
    expect(stillToBuy.text).toContain('No price');
    expect(stillToBuy.overflows).toBe(false);
  });

  test('still renders one real table row per material at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(`./industry/groups/${GROUP_ID}`);

    const { display, cells } = await readRow(page, TRITANIUM);
    expect(display).toBe('table-row');
    expect(cells.map((cell) => cell.label)).toEqual([
      'Material',
      'Qty',
      'Volume',
      'Owned',
      'Still to buy',
    ]);
  });
});
