/**
 * The Courier board's dense phone card at 390px (issues #1046, #1150).
 *
 * Below `sm` the board is a `DataTable` with `stackLayout="dense"`: each haul
 * is a two-line card, the route on line one with the ISK/jump cell
 * (`cardCorner`) in flow at its right, and every other figure on a dim meta
 * line under it. Hauls between the same two systems fold behind one lane
 * header (`groupBy`), collapsed until tapped.
 *
 * The first test pins the headline figure where a thumb scans for it: the
 * ISK/jump cell hugs the card's right padding edge and sits on the route's
 * line, not on a line of its own, with the going-rate badge under it. It
 * replaces #1046's check that the figure started at the labelled card's
 * gutter — that card is gone, and the right-aligned corner is the design.
 * Nothing in the unit suite can see this: jsdom lays nothing out, and
 * `productionCss.built.spec.ts` only checks that the stack collapses at all.
 *
 * Every haul the fixture seeds runs one lane, Jita → Amarr, so the first
 * thing in the table is that lane's collapsed header; both tests open it
 * before touching a haul.
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
 * Layout coordinates are fractional, so a pixel of slack absorbs sub-pixel
 * drift between two edges that genuinely coincide. The failures it separates
 * are far larger: a left-aligned corner leaves the figure and its badge a text
 * width apart (the badge is several characters longer), and a stray padding
 * utility pulls the figure a whole gutter (28px) off the card's edge.
 */
const ALIGNMENT_TOLERANCE_PX = 1;

/**
 * Two cells on one flex line with `align-items: baseline` start a few pixels
 * apart when their fonts differ (a bold figure beside a semibold name). A
 * wrap onto the next line moves the corner a full line (~16px) or more, so
 * half a line separates the two cleanly.
 */
const LINE_TOLERANCE_PX = 8;

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
  cornerRight: number;
  badgeRight: number;
  cardContentRight: number;
  cornerTop: number;
  primaryTop: number;
  cornerBottom: number;
  metaTop: number;
}

/** Open the seeded lane: every Jita → Amarr haul is folded behind this one header. */
async function expandLane(page: Page): Promise<void> {
  const table = page.getByRole('table', { name: 'Courier Contract Search' });
  const toggle = table.locator('tr.dt-group-header button').first();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test.describe('courier board — 390px width', () => {
  test.use({ viewport: PHONE });

  test('the ISK/jump figure heads the dense card at its right edge', async ({ page }) => {
    await stubSyncConfigured(page);
    await refuseSyncBackend(page);

    await signInAndGoto(page);
    await seedCourierSnapshot(page, courierSnapshotRows());

    // Search is the tab this page opens on, so it needs no `?tab=`.
    await page.goto('./contracts');
    await page.getByRole('button', { name: 'Courier' }).click();

    const table = page.getByRole('table', { name: 'Courier Contract Search' });
    // The collapsed lane must still carry its bait haul's warning — a folded
    // group that hid the over-rate marker would hide the one thing it is for.
    const header = table.locator('tr.dt-group-header').first();
    await expect(header).toContainText('25 hauls');
    await expect(header).toContainText('Over rate');

    await expandLane(page);
    // The top member is the bait haul: it sorts first under the default
    // ISK/jump descending sort. The badge is the whole wait: it needs the
    // jump counts, and through them the corpus median.
    const card = table.locator('tr.dt-group-member').first();
    const corner = card.locator('td.dt-corner');
    await expect(corner).toContainText(/going rate/);
    await expect(corner.getByText(/going rate/)).toBeVisible();

    const edges = await card.evaluate((row): CardEdges => {
      const cell = (selector: string): Element => {
        const found = row.querySelector(selector);
        if (!found) throw new Error(`No ${selector} on the dense card`);
        return found;
      };
      const cornerCell = cell('td.dt-corner');
      const stack = cornerCell.querySelector('div');
      if (!stack) throw new Error('ISK/jump cell is not the two-line flex cell');
      const badge = stack.querySelector('span');
      if (!badge) throw new Error('ISK/jump cell shows no going-rate badge');
      // Where the glyphs end, not the cell's box: a stray padding utility
      // would leave the box at the edge and the figure well short of it. A
      // `Range` over the figure's text reports what a reader sees — the
      // visible text only: `IskAmount`'s screen-reader copy of the exact
      // figure is clipped away but still reports its full-width box.
      const figure = stack.firstChild;
      if (!figure) throw new Error('ISK/jump cell rendered no figure');
      let glyphsRight = -Infinity;
      const walker = document.createTreeWalker(figure, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent?.trim() || text.parentElement?.closest('.sr-only')) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        glyphsRight = Math.max(glyphsRight, range.getBoundingClientRect().right);
      }
      const rowBox = row.getBoundingClientRect();
      const cornerBox = cornerCell.getBoundingClientRect();
      return {
        cornerRight: glyphsRight,
        badgeRight: badge.getBoundingClientRect().right,
        // The card's content edge, read from its own style rather than a
        // hardcoded inset, so a padding change moves the target with it.
        cardContentRight: rowBox.right - parseFloat(getComputedStyle(row).paddingRight),
        cornerTop: cornerBox.top,
        primaryTop: cell('td.dt-primary').getBoundingClientRect().top,
        cornerBottom: cornerBox.bottom,
        metaTop: cell('td.dt-meta').getBoundingClientRect().top,
      };
    });

    const measured =
      `figure right ${Math.round(edges.cornerRight)}px, ` +
      `badge right ${Math.round(edges.badgeRight)}px, ` +
      `card content right ${Math.round(edges.cardContentRight)}px, ` +
      `corner top ${Math.round(edges.cornerTop)}px vs route top ${Math.round(edges.primaryTop)}px`;

    expect(
      Math.abs(edges.cornerRight - edges.cardContentRight),
      `ISK/jump figure does not reach the card's right padding edge — ${measured}`
    ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
    expect(
      Math.abs(edges.badgeRight - edges.cornerRight),
      `Going-rate badge is not right-aligned under the figure — ${measured}`
    ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
    // On the route's line, not wrapped onto one of its own. Tops can differ by
    // the baseline alignment between a bold figure and the route's first line,
    // which is a few pixels — far less than a line height.
    expect(
      Math.abs(edges.cornerTop - edges.primaryTop),
      `ISK/jump cell is not on the route's line — ${measured}`
    ).toBeLessThanOrEqual(LINE_TOLERANCE_PX);
    expect(
      edges.cornerBottom,
      `ISK/jump cell runs into the meta line below it — ${measured}`
    ).toBeLessThanOrEqual(edges.metaTop + ALIGNMENT_TOLERANCE_PX);
  });

  test('the reverse-lane link meets the touch tier (issue #1150)', async ({ page }) => {
    await stubSyncConfigured(page);
    await refuseSyncBackend(page);

    await signInAndGoto(page);
    await seedCourierSnapshot(page, courierSnapshotRowsWithReverseLane());

    await page.goto('./contracts');
    await page.getByRole('button', { name: 'Courier' }).click();

    const table = page.getByRole('table', { name: 'Courier Contract Search' });
    // The haul is folded behind its lane's header until that is opened; the
    // reverse haul (Amarr → Jita) is a lane of one, which never folds.
    await expandLane(page);
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

  test('the ISK filters take shorthand and echo the parsed figure (issue #1722)', async ({
    page,
  }) => {
    await stubSyncConfigured(page);
    await refuseSyncBackend(page);

    await signInAndGoto(page);
    await seedCourierSnapshot(page, courierSnapshotRows());

    await page.goto('./contracts');
    await page.getByRole('button', { name: 'Courier' }).click();
    await page.getByRole('button', { name: /^Filters/ }).click();

    await page.getByRole('textbox', { name: 'Min reward' }).fill('1b');
    await expect(page.getByText('= 1,000,000,000 ISK')).toBeVisible();
    await page.getByRole('textbox', { name: 'Max collateral' }).fill('500m');
    await expect(page.getByText('= 500,000,000 ISK')).toBeVisible();
  });
});
