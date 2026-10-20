/**
 * Settings: every section stays within the phone height budget at 390px
 * (issue #4562). A phone screen is about 800px of content; a section is at
 * most about 1.5 screens (1200px) once its copy is trimmed, and the spec fails
 * above 1300px. Past that a section splits, or folds its secondary content by
 * default on a phone.
 *
 * Measured on the rendered section's own height, not a class string; see
 * `loyaltyStoreNarrow.spec.ts` for why.
 *
 * Uses the default seeded character with no Dexie overrides.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const LIMIT = 1300;

const SECTIONS = [
  'display',
  'notifications',
  'industry',
  'pi',
  'market',
  'miningTax',
  'characters',
  'corporation',
  'travel',
  'permissions',
  'app',
  'device',
  'dataAge',
  'offline',
  'activity',
];

/** Sections allowed past the limit, each with the reason. */
const OVER_BUDGET: Record<string, string> = {};

for (const section of SECTIONS) {
  test(`Settings › ${section} fits the phone height budget at 390px`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page, `./settings/${section}`);
    await page.waitForURL(new RegExp(`/settings/${section}$`));
    const content = page.locator('[data-settings-section]');
    // Corporation is hidden for a Character with no Corp access.
    if (section === 'corporation' && (await content.count()) === 0) test.skip();
    await expect(content).toBeVisible();
    // Let async panels settle before measuring.
    await page.waitForTimeout(500);
    const height = await content.evaluate((el) => Math.round(el.getBoundingClientRect().height));
    if (section in OVER_BUDGET) return;
    expect(height, `${section} is ${height}px tall`).toBeLessThanOrEqual(LIMIT);
  });
}

test('Travel folds Avoided systems and Also avoid at 390px; each opens on tap at the 44px floor', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './settings/travel');
  await page.waitForURL(/\/settings\/travel$/);

  const alsoAvoid = page.getByRole('button', { name: /^Also avoid/ });
  await expect(alsoAvoid).toHaveAttribute('aria-expanded', 'false');
  await expect(alsoAvoid).toContainText('of 3 on');
  expect(
    await alsoAvoid.evaluate((el) => el.getBoundingClientRect().height)
  ).toBeGreaterThanOrEqual(44);
  await alsoAvoid.click();
  await expect(alsoAvoid).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('checkbox', { name: /EDENCOM/ })).toBeVisible();

  const avoided = page.getByRole('button', { name: 'Show avoided systems' });
  await expect(page.getByRole('heading', { name: 'Avoided systems' }).locator('..')).toContainText(
    '0 systems'
  );
  expect(await avoided.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(
    44
  );
  await avoided.click();
  await expect(page.getByRole('button', { name: 'Hide avoided systems' })).toBeVisible();
});

test('Travel shows both blocks open at 1280px, with no fold controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInAndGoto(page, './settings/travel');
  await page.waitForURL(/\/settings\/travel$/);

  await expect(page.getByRole('checkbox', { name: /EDENCOM/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Also avoid/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /avoided systems$/i })).toHaveCount(0);
});
