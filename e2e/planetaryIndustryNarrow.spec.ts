/**
 * The PI Plan tab's Sensitivity table at 390px (issue #1134).
 *
 * That table is one row per sourcing floor and one short figure per customs
 * rate in the sweep — five fixed rates plus the pilot's own when it differs,
 * beside a footprint. At `DataTable`'s default `stackColumns={1}` each of
 * those six or seven figures took a full phone line, so comparing one floor
 * across rates (the table's whole reason to exist) was a scroll. Fixed the
 * same way `PriceHistoryChart.tsx`, `AppraisalPanel.tsx` and Mining Tax's
 * Yield Detail already are: `stackColumns={2}`.
 *
 * Playwright rather than jsdom because the pairing lives in `.dt-stack-2col`'s
 * `@media (width < 40rem)` grid (`src/styles/index.css`), which jsdom cannot
 * evaluate. The class token itself is already guarded beside the component in
 * `src/features/pi/PlanPanel.test.tsx`; what only a real engine can tell is a
 * paired card from the one-line-per-rate card that shipped, so the assertions
 * here are on bounding boxes — which cells share a line, and how wide each is.
 *
 * Both parities are driven, because unlike #1130's fixed four columns this
 * card's cell count moves with the pilot's own rate:
 *   - a 10% rate is already one of the fixed five, so the sweep stays five
 *     rates: footprint + 5 = 6 cells, an exact 2+2+2.
 *   - a 3% rate is not, so it folds in as a sixth column: 7 cells, and the
 *     last margin is the odd trailing cell #1113 had to prove lands cleanly.
 *
 * And both floor counts the issue names, from the product's own tier
 * (`validFloors` in `planModel.ts` — every tier under the target): a P3
 * product has three floors, a P2 product two.
 *
 * No colony fixture. The Plan tab costs a hypothetical chain from `pi.json`
 * and hub prices alone — it never reads the character's colonies — so the
 * product is chosen straight off the URL (`/plan?type=`) and the only
 * network this spec has to answer is Fuzzwork.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { SCOPES } from './support/fixtureData';
import { piTier } from '../src/engine/pi/chain';
import type { PiData } from '../src/sde/types';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** Camera Drones: a P3, so the grid has three floors — P0, P1, P2. */
const P3_PRODUCT = 2345;
/** Oxides: a P2, so the grid has two — P0 and P1. */
const P2_PRODUCT = 2317;

const SENSITIVITY_TABLE = 'Margin per unit for each sourcing floor across customs rates';
/** The winning floor's decorative star plus the words a screen reader gets. */
const BEST_MARKER = /★\s*Best at this rate/;

/** The graph the app itself bakes, so the engine's own `piTier` can read it. */
const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

/**
 * Flat per tier, as in `PlanPanel.test.tsx`: enough to keep a made tier worth
 * making. One price for every type would leave every floor's margin negative,
 * which every geometry assertion here would happily pass while showing the
 * pilot a card of losses.
 */
const UNIT_PRICE = [5, 760, 14_000, 100_000, 1_900_000];

/**
 * Quotes every type asked about, at its tier's price. The shared fixture
 * prices one type only, which would leave the whole chain unpriceable and
 * every cell reading "not priceable" — short strings that would satisfy the
 * layout checks below without proving a single margin rendered.
 * A later `page.route` wins over an earlier one — see `support/testBase.ts`.
 */
async function mockHubPrices(page: Page): Promise<void> {
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const types = new URL(route.request().url()).searchParams.get('types') ?? '';
    const body: Record<string, unknown> = {};
    for (const raw of types.split(',').filter(Boolean)) {
      const sell = UNIT_PRICE[piTier(Number(raw), pi)];
      body[raw] = {
        buy: { max: sell * 0.95, volume: 500_000, orderCount: 40 },
        sell: { min: sell, volume: 500_000, orderCount: 40 },
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/**
 * Opens the Plan tab on one product and pins the customs rate, which is what
 * decides the sweep's width. Gated on the Sensitivity table itself, so a
 * timeout here means the tab stopped costing the chain rather than that the
 * layout regressed.
 */
async function openSensitivity(page: Page, typeId: number, ratePercent: string): Promise<void> {
  await page.goto(`./planetary-industry/plan?type=${typeId}`);
  const table = page.getByRole('table', { name: SENSITIVITY_TABLE });
  // Well past the 5s default: the tab awaits the SDE bake plus a hub read for
  // every type in the chain, cold on a CI runner.
  await expect(table).toBeVisible({ timeout: 20_000 });

  const rate = page.getByLabel('Customs rate (%)');
  await rate.fill(ratePercent);
  // A real gate only for a rate outside the fixed five: there the column
  // appears once the fill has moved the sweep. At 10% — the highsec untrained
  // default, and already one of the five — nothing moves and this just says
  // the sweep is up. Attached, not visible: `.dt-stack thead` is clipped to
  // 1px on a phone, so the header is deliberately invisible there.
  await expect(
    table.getByRole('columnheader', { name: `${ratePercent}%`, exact: true })
  ).toBeAttached();
}

interface CellBox {
  label: string;
  text: string;
  top: number;
  left: number;
  width: number;
  /** `::before`'s `position` — `static` is the paired card's label-above-value, `absolute` the default card's pinned gutter. */
  labelPosition: string;
}

interface RowGeometry {
  display: string;
  /** The `tr`'s own content box — what the card's cells have to share. */
  contentWidth: number;
  rowHeight: number;
  cells: CellBox[];
}

/** One floor's cells, measured. Addressed by `data-row-key`, which is the floor itself. */
async function readRow(page: Page, floor: string): Promise<RowGeometry> {
  const row = page.locator(`table[aria-label="${SENSITIVITY_TABLE}"] tr[data-row-key="${floor}"]`);
  await expect(row).toBeVisible();
  return page.evaluate(
    ({ key, table: label }) => {
      const table = document.querySelector(`table[aria-label="${label}"]`)!;
      const row = table.querySelector(`tbody tr[data-row-key="${key}"]`) as HTMLElement;
      const style = getComputedStyle(row);
      const box = row.getBoundingClientRect();
      const cells = [...row.querySelectorAll(':scope > td')].map((td) => {
        const cellBox = td.getBoundingClientRect();
        return {
          label: td.getAttribute('data-label') ?? '',
          text: (td.textContent ?? '').trim(),
          top: cellBox.top,
          left: cellBox.left,
          width: cellBox.width,
          labelPosition: getComputedStyle(td, '::before').position,
        };
      });
      return {
        display: style.display,
        contentWidth: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        rowHeight: box.height,
        cells,
      };
    },
    { key: floor, table: SENSITIVITY_TABLE }
  );
}

/**
 * Cells clustered into the lines they actually render on, top-to-bottom then
 * left-to-right. A 1px tolerance rather than an exact match: grid stretches
 * the cells of one track row to a shared top, but a tolerance costs nothing
 * and will not split a line on a subpixel.
 */
function lines(cells: CellBox[]): CellBox[][] {
  const grouped: CellBox[][] = [];
  for (const cell of [...cells].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const last = grouped.at(-1);
    if (last && Math.abs(last[0].top - cell.top) <= 1) last.push(cell);
    else grouped.push([cell]);
  }
  return grouped;
}

function labelLines(cells: CellBox[]): string[][] {
  return lines(cells).map((line) => line.map((cell) => cell.label));
}

/** The pairs under the card's title, and the trailing cell when the count is odd. */
function assertPairing(
  valueLines: CellBox[][],
  contentWidth: number,
  { trailing }: { trailing: boolean }
): void {
  const pairs = trailing ? valueLines.slice(0, -1) : valueLines;
  // Destructured below, so a short line has to fail as a length rather than as
  // a TypeError on an undefined second cell.
  for (const line of pairs) expect(line).toHaveLength(2);
  for (const [first, second] of pairs) {
    // Side by side, each roughly half the card: same width, same line, and the
    // second starting past the end of the first (the 0.75rem gap).
    expect(second.left).toBeGreaterThan(first.left + first.width);
    expect(first.width).toBeCloseTo(second.width, 0);
    expect(first.width).toBeLessThan(contentWidth * 0.55);
    expect(first.width).toBeGreaterThan(contentWidth * 0.4);
    // The other half of "no misaligned label": each label sits above its value
    // in flow, not pinned into the default card's gutter — which inside a
    // ~165px cell would leave the margin nowhere to render. Track geometry
    // alone cannot see this, so without it the whole `td::before` rule could
    // be deleted and this spec stay green.
    for (const cell of [first, second]) expect(cell.labelPosition).toBe('static');
  }
  if (!trailing) return;

  const [odd] = valueLines.at(-1)!;
  const [firstOfPair] = pairs.at(-1)!;
  // The dangling half-row the issue asks about: it stays in the first track at
  // the same width as a paired cell, rather than stretching the card's width
  // and reading as a second title.
  expect(odd.left).toBeCloseTo(firstOfPair.left, 0);
  expect(odd.width).toBeCloseTo(firstOfPair.width, 0);
  expect(odd.labelPosition).toBe('static');
}

/**
 * The halved card still costs the page no sideways scroll, which is the risk a
 * two-track grid runs at 390px. Measured on the document, as
 * `appraisalSharedNarrow.spec.ts` does: `DataTable` renders a bare `<table>`
 * and `Panel padded={false}` a plain block div, so there is no scrolling
 * wrapper of its own to ask.
 */
async function assertNoOverflow(page: Page): Promise<void> {
  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
}

test.describe('PI Plan — stacked Sensitivity card', () => {
  test.beforeEach(async ({ page }) => {
    await mockHubPrices(page);
    await signInAndGoto(page);
  });

  test('pairs an even sweep two per row on all three of a P3 product’s floors', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openSensitivity(page, P3_PRODUCT, '10');

    const markedRates: Record<string, number> = {};
    for (const floor of ['P0', 'P1', 'P2']) {
      const { display, contentWidth, cells } = await readRow(page, floor);
      expect(display).toBe('grid');

      for (const cell of cells) {
        if (!BEST_MARKER.test(cell.text)) continue;
        markedRates[cell.label] = (markedRates[cell.label] ?? 0) + 1;
        // The marker rides inside the cell, so it must not widen it out of its
        // track — the half-width check the paired cells get below.
        expect(cell.width).toBeLessThan(contentWidth * 0.55);
      }

      // 10% is already one of the fixed five rates, so the sweep stays five
      // wide: footprint plus five margins under the floor's own title, an
      // exact 2+2+2. Asserted as the whole card at once — a per-pair check
      // would pass just as happily on a card that had dropped a column.
      expect(labelLines(cells)).toEqual([
        ['Floor'],
        ['Footprint', '0%'],
        ['5%', '10%'],
        ['15%', '20%'],
      ]);

      const [[title], ...valueLines] = lines(cells);
      // The floor still titles the card across both tracks (`grid-column: 1 / -1`).
      expect(title.width).toBeCloseTo(contentWidth, 0);
      assertPairing(valueLines, contentWidth, { trailing: false });
    }

    // Every rate still marks exactly one winning floor: the star survived the
    // reflow, and it did not multiply or vanish along the way.
    expect(markedRates).toEqual({ '0%': 1, '5%': 1, '10%': 1, '15%': 1, '20%': 1 });

    // The prices actually landed: a bought floor costs to a real ISK margin
    // rather than the em dash an unpriced chain would show in every cell.
    // (P0 is excluded on purpose — with no extractor yield given it reads
    // "needs rate", which is a legitimate short value, not a missing one.)
    const bought = await readRow(page, 'P1');
    for (const cell of bought.cells.slice(2)) expect(cell.text).toMatch(/\d/);

    await assertNoOverflow(page);
  });

  test('lands the odd trailing margin cleanly on both of a P2 product’s floors', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    // 3% is not one of the fixed columns, so it folds in as a sixth rate and
    // the card carries seven cells — an odd count, which the even sweep above
    // can never produce.
    await openSensitivity(page, P2_PRODUCT, '3');

    for (const floor of ['P0', 'P1']) {
      const { display, contentWidth, cells } = await readRow(page, floor);
      expect(display).toBe('grid');
      expect(labelLines(cells)).toEqual([
        ['Floor'],
        ['Footprint', '0%'],
        ['3%', '5%'],
        ['10%', '15%'],
        ['20%'],
      ]);

      const [[title], ...valueLines] = lines(cells);
      expect(title.width).toBeCloseTo(contentWidth, 0);
      assertPairing(valueLines, contentWidth, { trailing: true });
    }

    await assertNoOverflow(page);
  });

  test('keeps one real table row per floor at 1280px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await openSensitivity(page, P3_PRODUCT, '10');

    const { display, contentWidth, rowHeight, cells } = await readRow(page, 'P1');
    // `stackColumns` may only ever affect the card below `sm` — above it the
    // row is still a table row, footprint and all five margins on one line.
    expect(display).toBe('table-row');
    expect(labelLines(cells)).toEqual([['Floor', 'Footprint', '0%', '5%', '10%', '15%', '20%']]);
    // Not just "one line group": a single dense row, so a cell that started
    // wrapping would fail here rather than pass by sharing a top with its
    // neighbours.
    expect(rowHeight).toBeLessThan(40);
    // And no cell hoisted to title width — that is the stacked card's shape.
    for (const cell of cells) expect(cell.width).toBeLessThan(contentWidth * 0.9);
  });

  test('keeps each Make-or-buy cell on one line at 1024px, with the role and hub read apart', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openSensitivity(page, P3_PRODUCT, '10');

    const chain = page.getByRole('table').filter({
      has: page.getByRole('columnheader', { name: /Make or buy/ }),
    });
    await expect(chain).toBeVisible();

    // No Make-or-buy cell wraps: the role and the hub read share one line.
    const lineHeights = await chain
      .locator('tbody tr td:nth-child(6) > span')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(lineHeights.length).toBeGreaterThan(1);
    for (const h of lineHeights) expect(h).toBeLessThan(24);

    // The cell is its own line: role and hub read are two spans, never one string.
    const cells = chain.locator('tbody tr td:nth-child(6) > span');
    const spans = await cells
      .first()
      .locator('> span')
      .evaluateAll((els) => els.map((el) => el.textContent));
    expect(spans).toHaveLength(2);
    expect(spans[1]).toMatch(/^Hub: /);

    // The sensitivity table's unanswered cells no longer speak of a rate.
    const sensitivity = page.getByRole('table', { name: SENSITIVITY_TABLE });
    await expect(sensitivity.getByText('Needs yield').first()).toBeVisible();
    await expect(sensitivity.getByText(/needs a rate/i)).toHaveCount(0);
  });
});

test.describe('PI Colonies — Switch to an alt (issue #1770)', () => {
  const ALT_ID = 90000002;

  /** An alt with the planets grant and nothing cached: the "not loaded yet" row. */
  async function seedNotLoadedAlt(page: Page): Promise<void> {
    await page.evaluate(
      async ({ id, scopes }) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('neocom');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction(['characters', 'tokens'], 'readwrite');
          tx.objectStore('characters').put({
            characterId: id,
            name: 'Alt Hauler',
            ownerHash: 'OWNERHASH2',
            addedAt: Date.now(),
          });
          tx.objectStore('tokens').put({
            characterId: id,
            accessToken: 'alt-access',
            refreshToken: 'fake-refresh',
            expiresAt: Date.now() + 3_600_000,
            scopes,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        database.close();
      },
      { id: ALT_ID, scopes: [...SCOPES] }
    );
  }

  test('offers a 44px Switch action that stays on the page at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page, './planetary-industry');
    await seedNotLoadedAlt(page);
    // The app reads every signed-in character's ESI feeds; a 404 (not an empty list) keeps the alt's planets uncached, so it stays "not loaded".
    await page.route(`https://esi.evetech.net/characters/${ALT_ID}/**`, (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    );
    await page.reload();

    await page.getByRole('button', { name: /show \d+ alt/i }).click();
    const action = page.getByRole('button', { name: 'Switch to Alt Hauler' });
    await expect(action).toBeVisible();
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await assertNoOverflow(page);

    await action.click();
    // The alt is now the primary character: it is no longer a "not loaded" row.
    await expect(action).toHaveCount(0);
    expect(new URL(page.url()).pathname).toContain('/planetary-industry');
  });
});
