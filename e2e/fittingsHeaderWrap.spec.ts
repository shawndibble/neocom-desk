/**
 * Open Fitting header (issue #1925): the action buttons wrap as one group, so at 1024
 * Fittings, Compare, Export and Save share a line and the header stays about two rows
 * tall; at 1440 it is still one row. Structure only — no stat figure is awaited.
 * Neither moves when the Alpha and Mastery badges land (issue #2255).
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

/**
 * Holds `masteries.json` back until `release()`, so a test can measure the
 * header while the Mastery badge is still loading (issue #2255).
 */
async function holdMasteries(page: Page) {
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/data\/masteries\.json/, async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

function headerOf(page: Page) {
  return page
    .locator('div.rounded-xs')
    .filter({ has: page.getByRole('heading', { level: 1, name: 'Rifter' }) })
    .last();
}

/** Every action button's top edge, the header's height and the badge group's width, in one layout. */
async function measure(page: Page) {
  const header = headerOf(page);
  const names = ['Fittings', 'Export', 'Save', 'Fitting actions'];
  const buttons = names.map((name) => header.getByRole('button', { name, exact: false }).first());
  for (const [i, button] of buttons.entries()) await expect(button, names[i]).toBeVisible();
  const handles = await Promise.all(buttons.map((button) => button.elementHandle()));
  return header.evaluate(
    (el, targets) => ({
      ys: targets.map((target) => target!.getBoundingClientRect().y),
      height: el.getBoundingClientRect().height,
      // The badge group: the header's second child, after the identity. Its
      // width is what pushes the action group, whatever the fonts' metrics.
      badgesWidth: el.children[1]!.getBoundingClientRect().width,
    }),
    handles
  );
}

async function waitForBadges(page: Page) {
  const header = headerOf(page);
  await expect(header.getByRole('button', { name: /^(Alpha OK|Omega only)$/ })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Mastery', exact: true })).toBeVisible();
}

/**
 * The header before the Mastery badge loads, then after both badges land.
 * Each badge holds an empty slot its size while it loads (issue #2255), so
 * the action group sits where it will end up from the first paint instead of
 * jumping a row when the badges arrive.
 */
async function headerBeforeAndAfterBadges(page: Page, release: () => void) {
  await expect(headerOf(page).getByRole('button', { name: 'Mastery', exact: true })).toHaveCount(0);
  const before = await measure(page);
  release();
  await waitForBadges(page);
  const after = await measure(page);
  return { before, after };
}

test.describe('Open Fitting header action group', () => {
  test('keeps the four action buttons on one line at 1024x768', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const release = await holdMasteries(page);
    await signInAndGoto(page, './ships/fittings');
    await answerAnyType(page);
    await openRifter(page);

    const { before, after } = await headerBeforeAndAfterBadges(page, release);
    for (const y of after.ys) expect(y).toBeCloseTo(after.ys[0], 0);
    expect(after.height).toBeLessThan(130);
    // No jump: the buttons are where they were before the badges landed.
    for (const [i, y] of before.ys.entries()) expect(y).toBeCloseTo(after.ys[i], 0);
    // Font-independent: the badges took the space their slots held.
    expect(before.badgesWidth).toBeCloseTo(after.badgesWidth, 0);
  });

  test('is a single row at 1440x900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const release = await holdMasteries(page);
    await signInAndGoto(page, './ships/fittings');
    await answerAnyType(page);
    await openRifter(page);

    const { before, after } = await headerBeforeAndAfterBadges(page, release);
    for (const { ys, height } of [before, after]) {
      for (const y of ys) expect(y).toBeCloseTo(ys[0], 0);
      expect(height).toBeLessThan(90);
    }
    for (const [i, y] of before.ys.entries()) expect(y).toBeCloseTo(after.ys[i], 0);
    // Font-independent: the badges took the space their slots held.
    expect(before.badgesWidth).toBeCloseTo(after.badgesWidth, 0);
  });
});
