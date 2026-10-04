/**
 * Skills › Certificates add-to-plan action (issue #2523): every certificate
 * row's "Add {grade} to plan" was a `primary` (accent-filled) button — about
 * 70 solid accent blocks down the page, against DESIGN.md's one-primary-per-
 * view rule. It now uses `Button`'s default ghost variant at every width.
 *
 * Asserted on the computed background rather than the class string: the
 * accent token is resolved through a probe element so the check follows the
 * token, not a hard-coded colour.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function gotoCertificates(page: Page, size: { width: number; height: number }) {
  await signInAndGoto(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Certificates' }).click();
  await page.waitForURL(/\/skills\/certificates$/);
  await page.setViewportSize(size);
}

async function assertNoAccentFilledAddButtons(page: Page) {
  const addButtons = page.getByRole('button', { name: /^Add \w+ to plan$/ });
  await expect(addButtons.first()).toBeVisible();

  const { accent, backgrounds } = await addButtons.evaluateAll((buttons) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--color-accent)';
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { accent, backgrounds: buttons.map((b) => getComputedStyle(b).backgroundColor) };
  });

  // An unresolved var computes to transparent, not ''.
  expect(accent).not.toBe('rgba(0, 0, 0, 0)');
  expect(backgrounds.length).toBeGreaterThan(0);
  for (const background of backgrounds) expect(background).not.toBe(accent);
}

test('no certificate add-to-plan button is accent-filled at 390px', async ({ page }) => {
  await gotoCertificates(page, PHONE);
  await assertNoAccentFilledAddButtons(page);
});

test('no certificate add-to-plan button is accent-filled at 1280px', async ({ page }) => {
  await gotoCertificates(page, DESKTOP);
  await assertNoAccentFilledAddButtons(page);
});
