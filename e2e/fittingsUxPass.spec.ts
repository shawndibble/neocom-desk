/**
 * Fittings UX pass (issue #3079): the editor header, and the Ring tab's budget
 * strip on the phone. Invariants only — nothing overlaps, nothing overflows the
 * viewport, every control sits inside it — never pixel numbers, since CI's
 * fonts differ. Structure only; no stat figure is awaited.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

async function answerAnyType(page: Page) {
  await page.route(/\/universe\/types\/\d+$/, async (route) => {
    const typeId = Number(/\/universe\/types\/(\d+)$/.exec(route.request().url())![1]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type_id: typeId,
        name: `Type ${typeId}`,
        description: '',
        group_id: 46,
        published: true,
        dogma_attributes: [],
      }),
    });
  });
}

async function openRifter(page: Page) {
  const newFromHull = page.getByRole('button', { name: 'New from hull' });
  const hullSearch = page.getByRole('searchbox', { name: 'Search hulls' });
  await newFromHull.or(hullSearch).first().waitFor();
  if (await newFromHull.isVisible()) await newFromHull.click();
  await hullSearch.fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByRole('button', { name: 'Start fitting' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rifter' })).toBeVisible();
}

function headerOf(page: Page) {
  return page
    .locator('div.rounded-xs')
    .filter({ has: page.getByRole('heading', { level: 1, name: 'Rifter' }) })
    .last();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);
}

/** Every visible button in `region` lies inside the viewport, and none overlaps another. */
async function expectButtonsInsideAndApart(page: Page, region: ReturnType<typeof headerOf>) {
  const width = page.viewportSize()!.width;
  const boxes = [];
  for (const button of await region.getByRole('button').all()) {
    if (!(await button.isVisible())) continue;
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    boxes.push(box);
  }
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const apart =
        a.x + a.width <= b.x + 0.5 ||
        b.x + b.width <= a.x + 0.5 ||
        a.y + a.height <= b.y + 0.5 ||
        b.y + b.height <= a.y + 0.5;
      expect(apart, `${JSON.stringify(a)} overlaps ${JSON.stringify(b)}`).toBe(true);
    }
  }
}

test.describe('Fittings header', () => {
  for (const [width, height] of [
    [1024, 768],
    [1280, 800],
  ]) {
    test(`keeps the badges, and puts Compare and Copy stats in the ⋮ menu at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await signInAndGoto(page, './ships/fittings');
      await answerAnyType(page);
      await openRifter(page);

      const header = headerOf(page);
      await expect(header.getByRole('button', { name: /^(Alpha OK|Omega only)$/ })).toBeVisible();
      await expect(header.getByRole('button', { name: 'Compare', exact: true })).toHaveCount(0);
      await expectButtonsInsideAndApart(page, header);
      await expectNoHorizontalOverflow(page);

      await header.getByRole('button', { name: 'Fitting actions' }).click();
      await expect(page.getByRole('menuitem', { name: 'Compare' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Copy stats' })).toBeVisible();
    });
  }

  test('is one compact row at 390, the badges in its ⋮ menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndGoto(page, './ships/fittings');
    await answerAnyType(page);
    await openRifter(page);

    const header = headerOf(page);
    await expect(header.getByRole('button', { name: /^Save/ }).first()).toBeVisible();
    await expect(header.getByRole('button', { name: /^(Alpha OK|Omega only)$/ })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Mastery', exact: true })).toHaveCount(0);
    // Shorter than the two-line header it replaces (identity line, then badges + Save + ⋮).
    expect((await header.boundingBox())!.height).toBeLessThan(75);
    await expectButtonsInsideAndApart(page, header);
    await expectNoHorizontalOverflow(page);

    await header.getByRole('button', { name: 'Fitting actions' }).click();
    await expect(page.getByText(/^(Alpha OK|Omega only)$/)).toBeVisible();
  });
});

test.describe('Ring tab on the phone', () => {
  test('shows CPU and powergrid above the rack buttons, inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndGoto(page, './ships/fittings');
    await answerAnyType(page);
    await openRifter(page);
    await page.getByRole('tab', { name: 'Ring' }).click();

    const cpu = page.getByRole('meter', { name: /CPU/ }).first();
    const powergrid = page.getByRole('meter', { name: /Powergrid/ }).first();
    const racks = page.getByRole('button', { name: /^High slots\s*\d+ \/ \d+$/ });
    await expect(cpu).toBeVisible();
    await expect(powergrid).toBeVisible();
    const [cpuBox, pgBox, rackBox] = await Promise.all([
      cpu.boundingBox(),
      powergrid.boundingBox(),
      racks.boundingBox(),
    ]);
    expect(cpuBox!.y).toBeLessThan(rackBox!.y);
    expect(pgBox!.y).toBeLessThan(rackBox!.y);
    expect(cpuBox!.x + cpuBox!.width).toBeLessThanOrEqual(pgBox!.x + 0.5);
    expect(pgBox!.x + pgBox!.width).toBeLessThanOrEqual(390);
    // Under budget: no Make it fit.
    await expect(page.getByRole('button', { name: /make it fit/i })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
