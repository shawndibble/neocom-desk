import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { answerAnyType } from './support/universeTypes';

async function openRifter(page: Page) {
  const newFromHull = page.getByRole('button', { name: 'New from hull' });
  const hullSearch = page.getByRole('searchbox', { name: 'Search hulls' });
  await newFromHull.or(hullSearch).first().waitFor();
  if (await newFromHull.isVisible()) await newFromHull.click();
  await hullSearch.fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByRole('button', { name: 'Start empty fit' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rifter' })).toBeVisible();
}

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

async function measure(page: Page) {
  const header = headerOf(page);
  const names = ['Open', 'Export', 'Save', 'Fitting actions'];
  const buttons = names.map((name) => header.getByRole('button', { name, exact: false }).first());
  for (const [i, button] of buttons.entries()) await expect(button, names[i]).toBeVisible();
  const handles = await Promise.all(buttons.map((button) => button.elementHandle()));
  return header.evaluate(
    (el, targets) => ({
      ys: targets.map((target) => target!.getBoundingClientRect().y),
      height: el.getBoundingClientRect().height,
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
    for (const [i, y] of before.ys.entries()) expect(y).toBeCloseTo(after.ys[i], 0);
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
    expect(before.badgesWidth).toBeCloseTo(after.badgesWidth, 0);
  });
});
