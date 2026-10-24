/**
 * The Overview's widget grid and header geometry. Invariants, not pixels (CI's
 * fonts are not this machine's): no overlap, no horizontal overflow, the
 * header's controls one height, an Open link on the touch floor, and the grid's
 * "four Small, three Medium, two Large across" rule at desktop width.
 *
 * A layout is seeded through the `sync.overviewLayout` settings row; without
 * one the Overview shows its first-run prompt (see overviewWidgets.spec.ts).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { overviewLayoutSetting, signInAndGoto, type SeededWidget } from './support/authSeed';
import { ALLIANCE_ID, CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
import type { MarketOrder } from '../src/esi/endpoints';

const PHONE = { width: 390, height: 844 };
const HOUR_MS = 60 * 60 * 1000;
const FIRST_LOAD_MS = 20_000;

/** Distinct kinds, enough to fill two rows of four. */
const KINDS = [
  'training',
  'sp',
  'location',
  'wallet',
  'orders',
  'industry',
  'mail',
  'comingUp',
  'contracts',
  'planetary',
  'structures',
  'miningTax',
] as const;

function layoutOf(size: SeededWidget['size'], count: number) {
  return overviewLayoutSetting(KINDS.slice(0, count).map((kind) => ({ kind, size })));
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function cardBoxes(page: Page, count: number): Promise<Box[]> {
  const cards = page.locator('main section[aria-label]');
  // The first load on a cold dev server is slow; later assertions use the default budget.
  await expect(cards).toHaveCount(count, { timeout: FIRST_LOAD_MS });
  // Measure the settled board: the boxes are read one at a time, so a widget whose read lands
  // between two reads (its skeleton giving way to its body) would move the cards after it and
  // read as an overlap that is never on screen.
  await expect(page.locator('main section[aria-busy="true"]')).toHaveCount(0);
  const boxes: Box[] = [];
  for (let i = 0; i < count; i += 1) boxes.push((await cards.nth(i).boundingBox())!);
  return boxes;
}

/** How many cards share the first card's row. */
function firstRowCount(boxes: readonly Box[]): number {
  return boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 2).length;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - 1 &&
    b.x < a.x + a.width - 1 &&
    a.y < b.y + b.height - 1 &&
    b.y < a.y + a.height - 1
  );
}

function expectNoOverlap(boxes: readonly Box[]): void {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      expect(overlaps(boxes[i], boxes[j]), `cards ${i} and ${j} overlap`).toBe(false);
    }
  }
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
}

async function seedAndOpen(
  page: Page,
  size: SeededWidget['size'],
  count: number,
  viewport: { width: number; height: number }
) {
  await page.setViewportSize(viewport);
  await signInAndGoto(page, './overview', SCOPES, [layoutOf(size, count)]);
  return cardBoxes(page, count);
}

for (const [size, across] of [
  ['S', 4],
  ['M', 3],
  ['L', 2],
  ['F', 1],
] as const) {
  test(`${across} ${size} widget${across > 1 ? 's' : ''} per row on a 1440px desktop`, async ({
    page,
  }) => {
    const boxes = await seedAndOpen(page, size, 8, { width: 1440, height: 1000 });
    expect(firstRowCount(boxes)).toBe(across);
    expectNoOverlap(boxes);
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`Small widgets wrap without overflow or overlap at ${viewport.width}px`, async ({
    page,
  }) => {
    const boxes = await seedAndOpen(page, 'S', 8, viewport);
    // Never more than four across; a narrower window wraps to fewer, not to a squeeze.
    expect(firstRowCount(boxes)).toBeLessThanOrEqual(4);
    expect(firstRowCount(boxes)).toBeGreaterThanOrEqual(2);
    expectNoOverlap(boxes);
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}

test('on a phone S sits two across, with no overflow', async ({ page }) => {
  const small = await seedAndOpen(page, 'S', 6, PHONE);
  expect(firstRowCount(small)).toBe(2);
  expectNoOverlap(small);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test('on a phone M takes the whole row, with no overflow', async ({ page }) => {
  const medium = await seedAndOpen(page, 'M', 4, PHONE);
  expect(firstRowCount(medium)).toBe(1);
  expectNoOverlap(medium);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test("a widget's title link meets the 44px touch floor at 390px", async ({ page }) => {
  await seedAndOpen(page, 'S', 4, PHONE);
  // The title is the link to the kind's page (no separate Open link).
  const openLink = page.locator('main section h2 a').first();
  await expect(openLink).toBeVisible();
  // Polled: a card remounted as its reads land measures as a null box.
  await expect
    .poll(async () => (await openLink.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
});

function contractFixture(over: Record<string, unknown>) {
  return {
    contract_id: 1,
    issuer_id: CHARACTER_ID,
    issuer_corporation_id: 2,
    assignee_id: 0,
    acceptor_id: 0,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'public',
    date_issued: new Date(Date.now() - 24 * HOUR_MS).toISOString(),
    date_expired: new Date(Date.now() + 10 * 24 * HOUR_MS).toISOString(),
    ...over,
  };
}

for (const viewport of [{ width: 1280, height: 900 }, PHONE]) {
  test(`the header's controls are one height, with the bell top right, at ${viewport.width}px`, async ({
    page,
  }) => {
    // A courier due soon gives the Next deadline button something to show.
    await page.route(`https://esi.evetech.net/characters/${CHARACTER_ID}/contracts*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          contractFixture({
            contract_id: 7,
            issuer_id: 1,
            acceptor_id: CHARACTER_ID,
            type: 'courier',
            status: 'in_progress',
            date_accepted: new Date(Date.now() - 67 * HOUR_MS).toISOString(),
            days_to_complete: 3,
          }),
        ]),
      })
    );
    await page.setViewportSize(viewport);
    await signInAndGoto(page, './overview', SCOPES, [
      overviewLayoutSetting([{ kind: 'contracts', size: 'M' }]),
    ]);

    const main = page.locator('main');
    const next = main.getByRole('link', { name: /^Next/ });
    const customize = main.getByRole('button', { name: 'Customize' });
    const bell = main.getByRole('button', { name: /^Alerts/ });
    await expect(next).toBeVisible({ timeout: FIRST_LOAD_MS });
    await expect(customize).toBeVisible();
    // The header has no Refresh and no Character switcher.
    await expect(main.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
    await expect(main.getByRole('button', { name: /^Character:/ })).toHaveCount(0);

    const boxes = {
      next: (await next.boundingBox())!,
      customize: (await customize.boundingBox())!,
      bell: (await bell.boundingBox())!,
    };
    expect(Math.abs(boxes.next.height - boxes.customize.height)).toBeLessThan(1);
    expect(Math.abs(boxes.bell.height - boxes.customize.height)).toBeLessThan(1);
    if (viewport.width < 768) expect(boxes.customize.height).toBeGreaterThanOrEqual(44);
    // Customize and the bell share a row, the bell last, top right.
    expect(Math.abs(boxes.bell.y - boxes.customize.y)).toBeLessThan(2);
    expect(boxes.bell.x).toBeGreaterThan(boxes.customize.x);
    if (viewport.width < 768) {
      // Phone: Next is its own full-width line under Customize and the bell.
      expect(boxes.next.y).toBeGreaterThanOrEqual(boxes.customize.y + boxes.customize.height - 1);
      expect(boxes.next.width).toBeGreaterThan(viewport.width * 0.8);
    } else {
      // Desktop: one row, Next then Customize then the bell.
      expect(Math.abs(boxes.next.y - boxes.customize.y)).toBeLessThan(2);
      expect(boxes.next.x + boxes.next.width).toBeLessThanOrEqual(boxes.customize.x + 1);
    }

    // The button goes where the clock lives.
    await expect(next).toHaveAttribute('href', /\/contracts/);
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}

test('a long corporation / alliance line ends before Customize at 390px (no overlapping targets)', async ({
  page,
}) => {
  const corp = 'Bureau of Unified Harvesting';
  const alliance = 'Plenitude Alliance';
  const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(new RegExp(`esi\\.evetech\\.net/corporations/${CORPORATION_ID}/?$`), (route) =>
    route.fulfill(
      json({
        name: corp,
        ticker: 'BUH',
        ceo_id: 1,
        creator_id: 1,
        member_count: 5,
        tax_rate: 0.1,
        alliance_id: ALLIANCE_ID,
      })
    )
  );
  await page.route(new RegExp(`esi\\.evetech\\.net/alliances/${ALLIANCE_ID}/?$`), (route) =>
    route.fulfill(
      json({
        name: alliance,
        ticker: 'PLNT',
        creator_corporation_id: CORPORATION_ID,
        creator_id: 1,
        date_founded: '2019-01-01T00:00:00Z',
      })
    )
  );
  await page.route(/esi\.evetech\.net\/universe\/names/, (route) => {
    const ids = route.request().postDataJSON() as number[];
    return route.fulfill(
      json(
        ids.map((id) =>
          id === CORPORATION_ID
            ? { id, name: corp, category: 'corporation' }
            : id === ALLIANCE_ID
              ? { id, name: alliance, category: 'alliance' }
              : { id, name: `Unknown ${id}`, category: 'character' }
        )
      )
    );
  });
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './overview', SCOPES, [
    overviewLayoutSetting([{ kind: 'training', size: 'S' }]),
  ]);
  const header = page.locator('main header');
  const allianceLink = header.getByRole('link', { name: alliance });
  await expect(allianceLink).toBeVisible({ timeout: FIRST_LOAD_MS });
  const customize = (await header.getByRole('button', { name: 'Customize' }).boundingBox())!;
  for (const link of [allianceLink, header.getByRole('link', { name: corp })]) {
    const box = (await link.boundingBox())!;
    // The name truncates inside its own box, which ends before Customize's (the row's gap apart).
    expect(box.x + box.width).toBeLessThanOrEqual(customize.x - 8);
  }
});

/** Six sell orders, issued and expiring at different times so the Expires sort reorders them. */
function openOrderFixtures(): MarketOrder[] {
  return [34, 35, 36, 37, 38, 39].map((type_id, i) => ({
    order_id: 500 + i,
    type_id,
    price: 100 + i * 10,
    region_id: 10000002,
    location_id: 60003760,
    is_buy_order: false,
    is_corporation: false,
    volume_remain: 10,
    volume_total: 10,
    issued: new Date(Date.now() - i * 24 * HOUR_MS).toISOString(),
    duration: 90,
    range: 'station',
  }));
}

async function openOrdersWidget(page: Page, viewport: { width: number; height: number }) {
  await page.route(`**/characters/${CHARACTER_ID}/orders`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(openOrderFixtures()),
    })
  );
  await page.setViewportSize(viewport);
  await signInAndGoto(page, './overview', SCOPES, [
    overviewLayoutSetting([{ kind: 'orders', size: 'M', view: 'list' }]),
  ]);
  const sortButtons = page.locator('main section button[aria-label^="Sort by"]');
  await expect(sortButtons.first()).toBeVisible({ timeout: FIRST_LOAD_MS });
  return sortButtons;
}

test('Open Orders sort headers meet the 44px touch floor at 390px', async ({ page }) => {
  const sortButtons = await openOrdersWidget(page, PHONE);
  const count = await sortButtons.count();
  expect(count).toBeGreaterThanOrEqual(2);
  const boxes: Box[] = [];
  for (let i = 0; i < count; i += 1) {
    // Polled: a card remounted as its reads land measures as a null box.
    await expect
      .poll(async () => (await sortButtons.nth(i).boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
    boxes.push((await sortButtons.nth(i).boundingBox())!);
  }
  expectNoOverlap(boxes);
  for (const box of boxes) expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
  expect(await hasHorizontalOverflow(page)).toBe(false);

  // Sorting still works: Expires sets aria-sort, a second tap flips it.
  const header = page.locator('main section th', {
    has: page.locator('button[aria-label^="Expires"], button[aria-label$="Expires"]'),
  });
  await page.getByRole('button', { name: 'Sort by Expires' }).click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await page.getByRole('button', { name: 'Expires, sorted ascending' }).click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
});

test('Open Orders sort headers stay compact with a fine pointer at 1280px', async ({ page }) => {
  const sortButtons = await openOrdersWidget(page, { width: 1280, height: 900 });
  const count = await sortButtons.count();
  for (let i = 0; i < count; i += 1) {
    const box = (await sortButtons.nth(i).boundingBox())!;
    expect(box.height).toBeLessThan(30);
  }
});

for (const size of ['S', 'M'] as const) {
  test(`a ${size} widget's settings menu meets the 44px touch floor at 390px`, async ({ page }) => {
    await seedAndOpen(page, size, 4, PHONE);
    const triggers = page.locator('main section button[aria-label^="Settings for"]');
    await expect(triggers).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      // Polled: a card remounted as its reads land measures as a null box.
      await expect
        .poll(async () => (await triggers.nth(i).boundingBox())?.width ?? 0)
        .toBeGreaterThanOrEqual(44);
      await expect
        .poll(async () => (await triggers.nth(i).boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(44);
    }
    const trigger = triggers.first();
    const title = page.locator('main section h2 a').first();
    const headerBox = (await page.locator('main section h2').first().locator('..').boundingBox())!;
    const [t, l] = [(await trigger.boundingBox())!, (await title.boundingBox())!];
    expect(l.x + l.width).toBeLessThanOrEqual(t.x + 1);
    expect(headerBox.height).toBeLessThanOrEqual(45);
    expect(await hasHorizontalOverflow(page)).toBe(false);

    await trigger.click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Show on phone' })).toBeVisible();
    const menu = page.getByRole('menu');
    await expect(menu.getByText('View', { exact: true })).toBeVisible();
    await expect(menu.getByText('Character', { exact: true })).toBeVisible();
  });
}

test('the widget settings trigger stays compact with a fine pointer at 1280px', async ({
  page,
}) => {
  await seedAndOpen(page, 'M', 4, { width: 1280, height: 900 });
  const trigger = page.locator('main section button[aria-label^="Settings for"]').first();
  await expect.poll(async () => (await trigger.boundingBox())?.height ?? 99).toBeLessThan(40);
});

/**
 * L and F table widgets on a phone (#3683): column count follows the widget's size, not the
 * screen, so a layout resized on a desktop reaches a phone with every column. The first
 * column is the row's name; it must stay readable (>= 100px) and the table must stay inside
 * its card. `hideNarrow` columns drop out until the table is 28rem wide.
 */
const DAY_MS = 24 * HOUR_MS;
const ESI = 'https://esi.evetech.net';
const MIN_NAME_PX = 100;

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

function contract(id: number, fields: Record<string, unknown>) {
  return {
    contract_id: id,
    issuer_id: CHARACTER_ID,
    issuer_corporation_id: 2,
    assignee_id: 0,
    acceptor_id: 0,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'public',
    date_issued: new Date(Date.now() - DAY_MS).toISOString(),
    date_expired: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    title: `Listing number ${id}`,
    price: 1_000_000,
    ...fields,
  };
}

async function seedTableFeeds(page: Page): Promise<void> {
  await page.route(`${ESI}/incursions*`, (route) =>
    route.fulfill(
      json(
        [1, 2, 3].map((n) => ({
          constellation_id: 20000000 + n,
          faction_id: 500019,
          has_boss: n === 1,
          infested_solar_systems: [30000140 + n],
          influence: 0.4 + n / 10,
          staging_solar_system_id: 30000140 + n,
          state: 'established',
          type: 'Incursion',
        }))
      )
    )
  );
  await page.route(`${ESI}/characters/${CHARACTER_ID}/contracts*`, (route) =>
    route.fulfill(
      json([
        contract(9001, { date_expired: new Date(Date.now() + 6 * HOUR_MS).toISOString() }),
        contract(9002, { type: 'courier', title: '', reward: 5_000_000, collateral: 90_000_000 }),
        contract(9003, {
          type: 'courier',
          status: 'in_progress',
          acceptor_id: CHARACTER_ID,
          reward: 2_000_000,
          collateral: 40_000_000,
          date_accepted: new Date(Date.now() - HOUR_MS).toISOString(),
          days_to_complete: 3,
        }),
      ])
    )
  );
}

for (const kind of ['incursions', 'contracts'] as const) {
  for (const size of ['L', 'F'] as const) {
    test(`${kind} ${size} table keeps its name column readable at 390px`, async ({ page }) => {
      await seedTableFeeds(page);
      await page.setViewportSize(PHONE);
      await signInAndGoto(page, './overview', SCOPES, [
        overviewLayoutSetting([{ kind, size, view: 'list' }]),
      ]);
      const tableEl = page.locator('main table').first();
      const card = tableEl.locator('xpath=ancestor::section[1]');
      const rows = tableEl.locator('tbody tr');
      await expect(rows.first()).toBeVisible({ timeout: FIRST_LOAD_MS });
      const name = await rows.first().locator('td, th').first().boundingBox();
      const table = await tableEl.boundingBox();
      const box = await card.boundingBox();
      expect(name!.width).toBeGreaterThanOrEqual(MIN_NAME_PX);
      expect(table!.x + table!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
      expect(await hasHorizontalOverflow(page)).toBe(false);
      // Linked rows (incursions) keep the touch floor.
      const rowBox = await rows.first().boundingBox();
      if (kind === 'incursions') expect(rowBox!.height).toBeGreaterThanOrEqual(44);
    });
  }

  test(`${kind} L table keeps every column on a 1440px desktop`, async ({ page }) => {
    await seedTableFeeds(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInAndGoto(page, './overview', SCOPES, [
      overviewLayoutSetting([{ kind, size: 'L', view: 'list' }]),
    ]);
    const tableEl = page.locator('main table').first();
    await expect(tableEl.locator('tbody tr').first()).toBeVisible({ timeout: FIRST_LOAD_MS });
    // The last column is the one `hideNarrow` hides first; a linked table adds a blank caret header after it.
    const last = kind === 'incursions' ? 'Constellation' : 'Collateral';
    await expect(tableEl.getByRole('columnheader', { name: last })).toBeVisible();
  });
}
