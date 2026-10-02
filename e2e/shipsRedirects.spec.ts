/**
 * The Ships section's old paths (scope decision `20260926-135538`): every
 * Fitting Share Code ever copied is `/fittings?f=`, so it must still open the Fitting
 * in the editor; `/fittings` and `/skills/ships` land on the Fittings and
 * Tree tabs; and the two tabs switch between each other. Structure only — no
 * stat figure is awaited.
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

/** Starts a Rifter from the Fittings tab and returns its Fitting Share Code. */
async function rifterShareCode(page: Page): Promise<string> {
  const newFromHull = page.getByRole('button', { name: 'New from hull' });
  const hullSearch = page.getByRole('searchbox', { name: 'Search hulls' });
  await newFromHull.or(hullSearch).first().waitFor();
  if (await newFromHull.isVisible()) await newFromHull.click();
  await hullSearch.fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByRole('button', { name: 'Start fitting' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rifter' })).toBeVisible();
  await expect(page).toHaveURL(/\/ships\/fittings\/edit\?f=/);
  return new URL(page.url()).searchParams.get('f')!;
}

test.describe('Ships redirects', () => {
  test('an old /fittings?f= Fitting Share Code opens the Fitting in the editor', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAndGoto(page, './ships/fittings');
    await answerAnyType(page);
    const code = await rifterShareCode(page);

    await page.goto(`./fittings?${new URLSearchParams({ f: code })}`);
    await expect(page).toHaveURL(
      (url) => url.pathname.endsWith('/ships/fittings/edit') && url.searchParams.get('f') === code
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Rifter' })).toBeVisible();

    // A Fitting Share Code copied today reads /ships/fittings?f=; it opens the editor too.
    await page.goto(`./ships/fittings?${new URLSearchParams({ f: code })}`);
    await expect(page).toHaveURL(
      (url) => url.pathname.endsWith('/ships/fittings/edit') && url.searchParams.get('f') === code
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Rifter' })).toBeVisible();
  });

  test('/fittings lands on the Fittings tab', async ({ page }) => {
    await signInAndGoto(page, './fittings');
    await expect(page).toHaveURL(/\/ships\/fittings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Ships' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Fittings' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('/skills/ships lands on the Tree tab', async ({ page }) => {
    await signInAndGoto(page, './skills/ships');
    await expect(page).toHaveURL(/\/ships\/tree$/);
    await expect(page.getByRole('tab', { name: 'Tree' })).toHaveAttribute('aria-selected', 'true');
  });

  test('each Ships tab has one Ships title and one tab bar on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndGoto(page, './ships/fittings');
    for (const path of [/\/ships\/fittings$/, /\/ships\/tree$/]) {
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('heading', { level: 1, name: 'Ships' })).toHaveCount(1);
      await expect(page.getByRole('tablist', { name: 'Ships' })).toHaveCount(1);
      await page.getByRole('tab', { name: 'Tree' }).click();
    }
  });

  test('the Ships tabs switch between Fittings and Tree', async ({ page }) => {
    await signInAndGoto(page, './ships');
    await expect(page).toHaveURL(/\/ships\/fittings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Ships' })).toHaveCount(1);

    await page.getByRole('tab', { name: 'Tree' }).click();
    await expect(page).toHaveURL(/\/ships\/tree$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Ships' })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: 'Tree' })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: 'Fittings' }).click();
    await expect(page).toHaveURL(/\/ships\/fittings$/);
    await expect(page.getByRole('searchbox', { name: 'Search fittings' })).toBeVisible();
  });
});
