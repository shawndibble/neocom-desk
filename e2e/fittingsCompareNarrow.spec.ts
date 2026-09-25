/**
 * Fitting Compare tracer: adding Fittings, the phone paging window, and the
 * differences-only toggle at a phone width, without waiting on the dogma
 * engine's own WASM+SDE stats compute — `fittingsLoadNarrow`'s own precedent
 * is to assert on structure only, never a stat figure, since that download
 * is genuinely slow on a cold CI runner. The new Price rows and per-column
 * "Fits" status read off that same slow compute, so their values are left
 * to `fittingCompare.test.ts`'s engine-level coverage rather than asserted
 * on here.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };

/** Skill-gap/stats background compute reads every fitted type's requirements from
 * `/universe/types/{id}` — answered for any id so it doesn't escape as an unmocked request,
 * even though these specs never wait on that compute to finish. */
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

// Three different hulls, not three named variants of one hull: a compare column's header shows
// the hull's own name (`typeName(hullTypeId)`), never the custom name typed into the EFT header —
// a Share Link code carries no fit name at all, see `shareMapper.ts`. Distinct hulls give each
// column genuinely distinguishing text to assert on.
const FIT_A = ['[Rifter, Fit A]', '125mm Gatling AutoCannon I'].join('\n');
const FIT_B = ['[Merlin, Fit B]', '125mm Gatling AutoCannon I'].join('\n');
const FIT_C = ['[Punisher, Fit C]', '125mm Gatling AutoCannon I'].join('\n');

async function addFitting(page: Page, eft: string) {
  await page.getByRole('button', { name: 'Compare with…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Compare with…' });
  await dialog.getByRole('tab', { name: 'Import' }).click();
  await dialog.getByLabel('Link or text').fill(eft);
  await dialog.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test.describe('Fitting Compare at 390px', () => {
  test('adds Fittings, pages through three on phone, and keeps the layout within 390px', async ({
    page,
  }) => {
    await signInAndGoto(page, './fittings/compare');
    await answerAnyType(page);
    await page.setViewportSize(PHONE);

    // The compared Fittings' names only render once `FittingCompare`'s own `statsReady` gate
    // opens (the same dogma WASM+SDE compute `fittingsLoadNarrow` avoids waiting on elsewhere) —
    // give it the same cold-runner headroom the other narrow specs already use for that gate.
    const STATS_TIMEOUT = { timeout: 20_000 };

    await addFitting(page, FIT_A);
    await expect(page.getByText('Rifter')).toBeVisible(STATS_TIMEOUT);

    await addFitting(page, FIT_B);
    await expect(page.getByText('Rifter')).toBeVisible(STATS_TIMEOUT);
    await expect(page.getByText('Merlin')).toBeVisible(STATS_TIMEOUT);
    await expect(page.getByText('Show differences only')).toBeVisible();

    // A third slot brings phone paging into play (2 of 3 columns shown at a time).
    await addFitting(page, FIT_C);
    const prev = page.getByRole('button', { name: 'Previous' });
    const next = page.getByRole('button', { name: 'Next' });
    await expect(prev).toBeVisible(STATS_TIMEOUT);
    expect(await prev.isDisabled()).toBe(true);
    const nextBox = await next.boundingBox();
    expect(nextBox!.height).toBeGreaterThanOrEqual(44);

    await expect(page.getByText('Rifter')).toBeVisible(STATS_TIMEOUT);
    await expect(page.getByText('Punisher')).not.toBeVisible();

    await next.click();
    await expect(page.getByText('Punisher')).toBeVisible();
    await expect(page.getByText('Rifter')).not.toBeVisible();
    expect(await prev.isDisabled()).toBe(false);

    // No sideways scroll at 390px — the usual narrow-width regression.
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
  });
});
