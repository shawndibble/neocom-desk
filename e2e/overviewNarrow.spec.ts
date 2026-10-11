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
import { CHARACTER_ID, SCOPES } from './support/fixtureData';

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

test('a widget "Open" link meets the 44px touch floor at 390px', async ({ page }) => {
  await seedAndOpen(page, 'S', 4, PHONE);
  const openLink = page.getByRole('link', { name: /^Open .* page$/ }).first();
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
    // Next and Customize share a row; the bell sits above it, at the right, not wrapped under.
    expect(Math.abs(boxes.next.y - boxes.customize.y)).toBeLessThan(2);
    expect(boxes.bell.y + boxes.bell.height).toBeLessThanOrEqual(boxes.next.y + 1);
    expect(boxes.bell.x).toBeGreaterThan(boxes.customize.x);

    // The button goes where the clock lives.
    await expect(next).toHaveAttribute('href', /\/contracts/);
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}
