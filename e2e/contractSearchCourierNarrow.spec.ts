/**
 * The Courier board's ISK/jump cell at 390px (issue #1046).
 *
 * Below `sm` a `DataTable` row stops being a row: `.dt-stack` in
 * `src/styles/index.css` turns each one into a card whose every cell prints
 * its column header into a 7rem left gutter and starts its value at that
 * gutter's inner edge. The ISK/jump cell is the one cell that renders a flex
 * container rather than a value, because it carries a second line — the
 * "Nx going rate" badge — and that container carried `items-end`
 * unconditionally. Right-aligned is correct in the table at pointer width and
 * wrong in the card, where it left one line hugging the card's right edge
 * while every sibling line began at the gutter. Nothing in the suite could see
 * that: `productionCss.built.spec.ts` checks that the stack collapses at all,
 * and no spec had ever rendered this board.
 *
 * The alignment assertion is that file's, reused rather than reinvented: take
 * the left edges of two values on the same card and require them to agree. The
 * reference is the Jumps cell one line above — a plain value in an ordinary
 * stacked cell — so "the ISK/jump figure starts where the Jumps figure starts"
 * is exactly the property the fix restores. Both lines of the cell are
 * measured, the figure and the badge, because `items-end` moved both.
 *
 * Text, not boxes: the ISK/jump figure and the Jumps count are bare strings
 * inside their cells, and the flex container is full width under either
 * alignment — so its own box says nothing. A `Range` over the text reports
 * where the glyphs actually sit, which is what a reader sees.
 *
 * ## Why this spec stubs one module
 *
 * `ContractSearchPanel` is gated twice on `isSyncConfigured()`: without it the
 * whole Search tab renders a "needs the sync backend" empty state, and
 * `loadCourier` returns a constant rather than reading anything. E2E blanks
 * `VITE_FIREBASE_API_KEY` on purpose (see `playwright.config.ts`) so the app
 * never reaches the real cloud — which means that gate is shut for every spec
 * and this board is unreachable from a signed-in session as things stand.
 * Setting the key instead would turn sync on for the whole suite, which is the
 * thing that config comment exists to prevent.
 *
 * So the dev server's own module for `@/app/syncStatus` is served back as a
 * two-line stub. It is the same trade `mockEsi.ts` makes one layer out — the
 * backend is replaced, the app under test is not — and it is deliberately the
 * smallest module that opens the gate: the panel, the table, the cell and the
 * CSS under test are all the real ones. Firebase's own hosts are then refused
 * below, because "configured" now means the snapshot loaders will try; that
 * refusal is what sends them to their Dexie copy, which is the row seeded
 * here.
 *
 * If the stub ever stops matching (a moved module, a renamed export) the gate
 * shuts again, the Courier chip never appears, and this fails at its first
 * `expect` rather than quietly asserting nothing.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import type { Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

/**
 * Layout coordinates are fractional, and the two states this separates are most
 * of a card's width apart (~250px at this viewport) — so a pixel of slack costs
 * nothing and absorbs sub-pixel drift between two boxes that genuinely share an
 * edge.
 */
const ALIGNMENT_TOLERANCE_PX = 1;

/**
 * Real ids out of `public/data/market/stations.json`, so both ends resolve and
 * a stargate route between them exists. It is not decoration: the cell
 * early-returns a bare "…" while the jump counts are pending, and a spec whose
 * endpoints never place would measure that ellipsis and pass on anything.
 */
const JITA_4_4 = 60003760;
const AMARR_VIII = 60008494;
const THE_FORGE = 10000002;
const DOMAIN = 10000043;

/** The touch tier `controlHeightClassName.md` sets aside for a phone thumb. */
const TOUCH_TARGET_PX = 44;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A corpus, not a row: `corpusGoingRate` refuses a median under
 * `MIN_GOING_RATE_SAMPLE` (20) rates, and with no median no row shows a badge
 * at all — which would leave half of what this spec exists to check
 * unrendered. Twenty-four ordinary hauls set the median; the one after them
 * pays far enough above it to earn the badge.
 */
function courierSnapshotRows() {
  const rows = [];
  for (let index = 0; index < 24; index += 1) {
    rows.push({
      contractId: 4_000_000 + index,
      regionId: THE_FORGE,
      originLocationId: JITA_4_4,
      destinationLocationId: AMARR_VIII,
      // Ordinary freighter work, spread a little so the median is a real
      // middle rather than one figure repeated twenty-four times.
      reward: 5_000_000 + index * 100_000,
      volume: 10_000,
      collateral: 100_000_000,
      daysToComplete: 5,
      dateExpired: Date.now() + 7 * DAY_MS,
    });
  }
  rows.push({
    // `courierGoingRate.ts`'s own documented shape for the badge: a small
    // parcel paying several times what the corpus does per m³ per jump. It
    // also sorts to the top under the board's default ISK/jump descending
    // sort, so the first card is the one carrying both lines.
    contractId: 4_999_999,
    regionId: THE_FORGE,
    originLocationId: JITA_4_4,
    destinationLocationId: AMARR_VIII,
    reward: 30_000_000,
    volume: 5_000,
    collateral: 250_000_000,
    daysToComplete: 3,
    dateExpired: Date.now() + 7 * DAY_MS,
  });
  return rows;
}

/**
 * The corpus above plus one haul running the lane backwards — Amarr to Jita
 * rather than Jita to Amarr — so `reverseLaneMatches` (issue #941) finds a
 * real, placeable return leg for the top card's detail modal to count.
 */
function courierSnapshotRowsWithReverseLane() {
  return [
    ...courierSnapshotRows(),
    {
      contractId: 4_999_998,
      regionId: DOMAIN,
      originLocationId: AMARR_VIII,
      destinationLocationId: JITA_4_4,
      reward: 6_000_000,
      volume: 10_000,
      collateral: 100_000_000,
      daysToComplete: 5,
      dateExpired: Date.now() + 7 * DAY_MS,
    },
  ];
}

/**
 * The snapshot the panel would have read from Firestore, written straight into
 * the `esiCache` row it caches under — `publicCourierContracts` beneath
 * `GLOBAL_CACHE_CHARACTER_ID` (0), stamped now so `readFreshRow` serves it
 * without a live call at all.
 *
 * Raw IndexedDB rather than Dexie, the same way `support/login.ts` reaches this
 * table: the app's module graph is not the test's to import, and the row is
 * inline-keyed on `[characterId+key]`.
 */
async function seedCourierSnapshot(page: Page, rows: unknown[]): Promise<void> {
  await page.evaluate(async (seeded) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neocom');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('esiCache', 'readwrite');
      tx.objectStore('esiCache').put({
        characterId: 0,
        key: 'publicCourierContracts',
        value: { rows: seeded, lastSyncedAt: Date.now() },
        fetchedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, rows);
}

/** The gate described at the top of this file, opened for this page only. */
async function stubSyncConfigured(page: Page): Promise<void> {
  await page.route('**/src/app/syncStatus.ts*', async (route) => {
    await route.fulfill({
      contentType: 'text/javascript',
      // Both of the module's runtime exports, so every importer still gets the
      // module it asked for — only the answer changes.
      body: [
        'export function isSyncConfigured() { return true; }',
        'export function syncDisplayState(status, online) {',
        "  return online ? status.state : 'offline';",
        '}',
        '',
      ].join('\n'),
    });
  });
}

/**
 * Firebase now reads as configured, so the sync triggers and both snapshot
 * loaders will try to reach it. Refused here rather than left to `testBase`'s
 * network guard: the guard records an escape before aborting and fails the run
 * at teardown, where an unreachable backend is precisely the state this spec
 * wants — it is what sends the Courier loader to the Dexie row seeded above.
 * Four host patterns rather than one catch-all handler that defers: every other
 * request must keep reaching the fixture's own routes, and the last of those
 * is the guard that fails the run on a real network escape. Nothing this spec
 * registers should be able to stand between a stray request and that guard.
 */
async function refuseSyncBackend(page: Page): Promise<void> {
  const SYNC_HOSTS = [
    'https://*.googleapis.com/**',
    'https://*.cloudfunctions.net/**',
    'https://*.firebaseio.com/**',
    'https://*.gstatic.com/**',
  ];
  for (const pattern of SYNC_HOSTS) {
    await page.route(pattern, (route) => route.abort('failed'));
  }
}

interface CardEdges {
  jumpsValue: number;
  rateValue: number;
  badge: number;
  cardRight: number;
}

test.describe('courier board — 390px width', () => {
  test.use({ viewport: PHONE });

  test('the ISK/jump cell starts at the card gutter, not the card edge', async ({ page }) => {
    await stubSyncConfigured(page);
    await refuseSyncBackend(page);

    await signInAndGoto(page);
    await seedCourierSnapshot(page, courierSnapshotRows());

    // Search is the tab this page opens on, so it needs no `?tab=`.
    await page.goto('./contracts');
    await page.getByRole('button', { name: 'Courier' }).click();

    const table = page.getByRole('table', { name: 'Courier Contract Search' });
    const card = table.locator('tbody tr').first();
    // The badge is the whole wait: it needs the jump counts, and through them
    // the corpus median. Until the distances land the cell renders a bare "…"
    // and there is nothing on the card worth measuring.
    await expect(card.locator('td[data-label="ISK/jump"] span')).toHaveText(/going rate/);

    const edges = await card.evaluate((row): CardEdges => {
      /** Where the glyphs start: a text node has no box of its own, and the flex container is full width whichever way it aligns its children. */
      const leftOf = (node: Node): number => {
        if (node.nodeType === Node.TEXT_NODE) {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getBoundingClientRect().left;
        }
        return (node as Element).getBoundingClientRect().left;
      };
      const cellFor = (label: string): Element => {
        const cell = row.querySelector(`td[data-label="${label}"]`);
        if (!cell) throw new Error(`No "${label}" cell on the stacked card`);
        return cell;
      };
      const firstChildOf = (node: Node, what: string): Node => {
        const child = node.firstChild;
        if (!child) throw new Error(`${what} rendered nothing to measure`);
        return child;
      };

      const jumpsCell = cellFor('Jumps');
      const stack = cellFor('ISK/jump').querySelector('div');
      if (!stack) throw new Error('ISK/jump cell is not the two-line flex cell');
      const badge = stack.querySelector('span');
      if (!badge) throw new Error('ISK/jump cell shows no going-rate badge');

      return {
        jumpsValue: leftOf(firstChildOf(jumpsCell, 'Jumps cell')),
        rateValue: leftOf(firstChildOf(stack, 'ISK/jump figure')),
        badge: leftOf(badge),
        cardRight: row.getBoundingClientRect().right,
      };
    });

    const measured =
      `ISK/jump figure at ${Math.round(edges.rateValue)}px, ` +
      `badge at ${Math.round(edges.badge)}px, ` +
      `Jumps value at ${Math.round(edges.jumpsValue)}px, ` +
      `card right edge ${Math.round(edges.cardRight)}px`;

    expect(
      Math.abs(edges.rateValue - edges.jumpsValue),
      `ISK/jump figure does not start at the card's label gutter — ${measured}`
    ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
    expect(
      Math.abs(edges.badge - edges.jumpsValue),
      `Going-rate badge does not start at the card's label gutter — ${measured}`
    ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
  });

  test('the reverse-lane link meets the touch tier (issue #1150)', async ({ page }) => {
    await stubSyncConfigured(page);
    await refuseSyncBackend(page);

    await signInAndGoto(page);
    await seedCourierSnapshot(page, courierSnapshotRowsWithReverseLane());

    await page.goto('./contracts');
    await page.getByRole('button', { name: 'Courier' }).click();

    const table = page.getByRole('table', { name: 'Courier Contract Search' });
    // Matched by its own reward rather than board position — the reverse-leg
    // row above was built to answer for this exact haul, not "whichever one
    // sorts first".
    await table.getByRole('row', { name: /30,000,000\.00 ISK/ }).click();

    const reverseLaneLink = page.getByRole('button', { name: /reverse lane/ });
    await expect(reverseLaneLink).toBeVisible();

    const box = await reverseLaneLink.boundingBox();
    expect(box, 'reverse-lane link has no layout box').not.toBeNull();
    expect(
      box!.height,
      `reverse-lane link is only ${box!.height}px tall at 390px width`
    ).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
  });
});
