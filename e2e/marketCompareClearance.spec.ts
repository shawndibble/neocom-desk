import type { Page } from '@playwright/test';
import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

async function fillCompareSet(page: Page) {
  await signInAndGoto(page);
  await page.route(/\/markets\/\d+\/orders/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
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
    if (name === 'phone') await page.keyboard.press('Escape');
    expect(await clearance(page)).not.toBe('');
    const { bottom, drawerTop } = await lastFocusBottomAndDrawerTop(page);
    expect(bottom).toBeLessThanOrEqual(drawerTop);
  });
}
