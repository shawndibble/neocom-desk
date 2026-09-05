/**
 * `FilterBar`'s mobile sheet at 390px, against the dev server.
 *
 * Two of its three claims are invisible to jsdom, which has no layout and no
 * top layer:
 *
 * - A Radix `Select` opened inside `Modal` must render *above* the dialog and
 *   take a click. `Modal` runs on `showModal()`, so the dialog sits in the
 *   browser's top layer with everything outside it inert; Radix's default
 *   portal target (`document.body`) is neither. The unit test can assert the
 *   list lands inside the dialog element, but only a real browser has a top
 *   layer to get this wrong in.
 * - Collapsing the row must not cost horizontal overflow. Same
 *   `scrollWidth <= clientWidth` assertion `productionCss.built.spec.ts`
 *   established.
 *
 * `/styleguide` is the target for the same reasons that spec gives: outside
 * `RequireCharacter`, no ESI, and it already carries a `FilterBar` sample.
 */
import { test, expect } from './support/testBase';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test('collapses the filters behind a trigger at 390px and commits on Apply', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/styleguide');

  const trigger = page.getByRole('button', { name: /^Filters/ });
  await expect(trigger).toBeVisible();
  // The search box never moves into the sheet.
  await expect(page.getByRole('searchbox', { name: 'Search entries' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Ref type' })).toHaveCount(0);

  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Filters' });
  await expect(dialog).toBeVisible();

  // The select's list has to clear the dialog's top layer to be clickable.
  await dialog.getByRole('combobox', { name: 'Ref type' }).click();
  await page.getByRole('option', { name: 'Bounty prizes' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Ref type' })).toHaveText('Bounty prizes');

  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();
  // One filter away from its default, stated as a number on the trigger.
  await expect(page.getByRole('button', { name: 'Filters (1 active)' })).toBeVisible();

  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
});

test('keeps the filters in the row on a pointer viewport', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/styleguide');

  await expect(page.getByRole('combobox', { name: 'Ref type' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Filters/ })).toHaveCount(0);
});
