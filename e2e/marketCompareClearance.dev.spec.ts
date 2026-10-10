/**
 * The Compare drawer is fixed over the page bottom, so the page must reserve
 * real space for it (issue #3351, WCAG 2.4.11 Focus Not Obscured): the last
 * focusable element, focused, sits above the drawer's top edge. Asserted on
 * rendered boxes at desktop and phone width.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/**
 * Fills the Compare Set the way the Market Browser does now that the tree
 * leaf has no menu: the item's Variations tab, "Compare". The set holds the
 * whole variation group, so the handle reads `Compare (N)`.
 */
async function fillCompareSet(page: Page) {
  await signInAndGoto(page);
  // Empty order books: each variation row prices itself from its own book.
  await page.route(/\/markets\/\d+\/orders/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  // Every compared variation reads `/universe/types/{id}`; the shared mock
  // only carries a few fixture types.
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
  await page.goto('./market');

  await page.getByRole('searchbox', { name: 'Search items' }).fill('1MN Afterburner I');
  await page.getByRole('button', { name: '1MN Afterburner I', exact: true }).click();
  await page.getByRole('tab', { name: /^Variations/ }).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
}

const HANDLE = /^Compare \(\d+\)$/;

async function clearance(page: Page) {
  return page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--compare-drawer-clearance')
  );
}

/** Focuses the last tabbable element inside `main`, returns its bottom and the drawer top. */
async function lastFocusBottomAndDrawerTop(page: Page) {
  return page.evaluate(async () => {
    const main = document.querySelector('main')!;
    const tabbables = Array.from(
      main.querySelectorAll<HTMLElement>('a[href], button, input, select, [tabindex="0"]')
    ).filter(
      (el) =>
        !el.closest('[inert], #compare-drawer') &&
        !/^Compare \(\d+\)$/.test(el.textContent?.trim() ?? '') &&
        el.getClientRects().length > 0
    );
    const last = tabbables.at(-1)!;
    last.focus();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const handle = Array.from(document.querySelectorAll('button')).find((b) =>
      /^Compare \(\d+\)$/.test(b.textContent?.trim() ?? '')
    )!;
    return {
      bottom: last.getBoundingClientRect().bottom,
      drawerTop: handle.parentElement!.getBoundingClientRect().top,
    };
  });
}

for (const [name, viewport] of [
  ['desktop', DESKTOP],
  ['phone', PHONE],
] as const) {
  test(`last focus stop clears the Compare handle at ${name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await fillCompareSet(page);
    await expect(page.getByRole('button', { name: HANDLE })).toBeVisible();
    // Phone: the open drawer is a full-screen sheet over an inert page, so
    // check the handle-only state there.
    if (name === 'phone') await page.keyboard.press('Escape');
    expect(await clearance(page)).not.toBe('');
    const { bottom, drawerTop } = await lastFocusBottomAndDrawerTop(page);
    expect(bottom).toBeLessThanOrEqual(drawerTop);
  });
}
