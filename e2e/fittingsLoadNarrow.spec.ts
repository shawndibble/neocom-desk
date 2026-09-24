/**
 * Fittings section tracer (issue #1532): pasting an EFT fit Loads it and
 * renders the List view, at a phone width where every tappable control still
 * meets the 44px touch-target floor (DESIGN.md, `min-h-11`). The stats
 * sections wait on the dogma engine's own WASM+SDE download — genuinely slow
 * on a cold CI runner — so this spec asserts on the List view and the Load
 * control only, not on any stat figure.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };

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
    // The Fitting's skill gaps read each fitted type's requirements from
    // `/universe/types/{id}`, which the shared ESI mock only carries a few
    // fixture types for — answer for any id, with no skill requirements.
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
    await page.setViewportSize(PHONE);

    await page.getByLabel('Paste EFT fit text').fill(RIFTER_EFT);
    const loadButton = page.getByRole('button', { name: 'Load', exact: true });
    const box = await loadButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await loadButton.click();

    await expect(page.getByRole('heading', { name: 'List' })).toBeVisible();
    await expect(page.getByText('High slots')).toBeVisible();
    await expect(page.getByText('Mid slots')).toBeVisible();

    // No sideways scroll at 390px — the usual narrow-width regression.
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
  });
});
