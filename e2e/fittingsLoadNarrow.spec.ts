/**
 * Fittings section tracer (issue #1532): pasting an EFT fit Loads it and
 * renders the List view, at a phone width where every tappable control still
 * meets the 44px touch-target floor (DESIGN.md, `min-h-11`). The stats
 * sections wait on the dogma engine's own WASM+SDE download — genuinely slow
 * on a cold CI runner — so this spec asserts on the List view and the Load
 * control only, not on any stat figure.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };

/**
 * The Fitting's skill gaps read each fitted type's requirements from
 * `/universe/types/{id}`, which the shared ESI mock only carries a few
 * fixture types for — answer for any id, with no skill requirements.
 */
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

const RIFTER_EFT = [
  '[Rifter, Tracer Test]',
  '125mm Gatling AutoCannon I',
  '',
  '1MN Afterburner I',
].join('\n');

test.describe('Fittings — Load (EFT paste) at 390px', () => {
  test('loads a pasted fit into the List view, and the Load button meets the touch-target floor', async ({
    page,
  }) => {
    await signInAndGoto(page, './fittings');
    await answerAnyType(page);
    await page.setViewportSize(PHONE);

    // A phone's Start screen shows one way in at a time; Load is under Import.
    await page.getByRole('tab', { name: 'Import' }).click();
    await page.getByLabel('Link or text').fill(RIFTER_EFT);
    const loadButton = page.getByRole('button', { name: 'Load', exact: true });
    const box = await loadButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await loadButton.click();

    await expect(page.getByRole('heading', { name: 'List' })).toBeVisible();
    await expect(page.getByText('High slots', { exact: true })).toBeVisible();
    await expect(page.getByText('Mid slots', { exact: true })).toBeVisible();

    // No sideways scroll at 390px — the usual narrow-width regression.
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
  });

  test('switches to the Ring overview, edits a rack through a 44px rack button, and remembers the choice across a reload', async ({
    page,
  }) => {
    await signInAndGoto(page, './fittings');
    await answerAnyType(page);
    await page.setViewportSize(PHONE);

    // A phone's Start screen shows one way in at a time; Load is under Import.
    await page.getByRole('tab', { name: 'Import' }).click();
    await page.getByLabel('Link or text').fill(RIFTER_EFT);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'List' })).toBeVisible();

    const ringToggle = page.getByRole('button', { name: 'Ring', exact: true });
    const toggleBox = await ringToggle.boundingBox();
    expect(toggleBox!.height).toBeGreaterThanOrEqual(44);
    await ringToggle.click();

    await expect(page.getByRole('heading', { name: 'Ring' })).toBeVisible();
    // At 390px the ring is an overview — its tiles are too small to be the
    // tap target (scope decision 20260924-205720) — so the rack buttons are.
    await expect(page.getByLabel(/^High slots 1,/)).toBeVisible();
    const rackButton = page.getByRole('button', { name: /^High slots\s*\d+ \/ \d+/ });
    const rackBox = await rackButton.boundingBox();
    expect(rackBox!.height).toBeGreaterThanOrEqual(44);
    await rackButton.click();
    const sheet = page.getByRole('dialog', { name: 'High slots' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('125mm Gatling AutoCannon I')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ring' })).toBeVisible();
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
  });

  test('starts a new Fitting from a hull on the Start screen', async ({ page }) => {
    await signInAndGoto(page, './fittings');
    await answerAnyType(page);
    await page.setViewportSize(PHONE);

    await page.getByRole('searchbox', { name: 'Search hulls' }).fill('Rifter');
    await page.getByRole('button', { name: 'Rifter', exact: true }).click();
    const start = page.getByRole('button', { name: 'Start fitting' });
    expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await start.click();

    await expect(page.getByRole('heading', { level: 1, name: 'Rifter' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'List' })).toBeVisible();
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
  });
});
