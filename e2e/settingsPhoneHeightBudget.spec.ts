import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

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

const OVER_BUDGET: Record<string, string> = {};

for (const section of SECTIONS) {
  test(`Settings › ${section} fits the phone height budget at 390px`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAndGoto(page, `./settings/${section}`);
    await page.waitForURL(new RegExp(`/settings/${section}$`));
    const content = page.locator('[data-settings-section]');
    if (section === 'corporation' && (await content.count()) === 0) test.skip();
    await expect(content).toBeVisible();
    const measure = () => content.evaluate((el) => Math.round(el.getBoundingClientRect().height));
    let previous = -1;
    await expect
      .poll(async () => {
        const current = await measure();
        const settled = current === previous;
        previous = current;
        return settled;
      })
      .toBe(true);
    const height = await measure();
    if (section in OVER_BUDGET) return;
    expect(height, `${section} is ${height}px tall`).toBeLessThanOrEqual(LIMIT);
  });
}

test('Travel folds Avoided systems and Also avoid at 390px; each opens on tap at the 36px floor', async ({
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
  ).toBeGreaterThanOrEqual(36);
  await alsoAvoid.click();
  await expect(alsoAvoid).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('checkbox', { name: /EDENCOM/ })).toBeVisible();

  const avoided = page.getByRole('button', { name: 'Show avoided systems' });
  await expect(page.getByRole('heading', { name: 'Avoided systems' }).locator('..')).toContainText(
    '0 systems'
  );
  expect(await avoided.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(
    36
  );
  await avoided.click();
  await expect(page.getByRole('button', { name: 'Hide avoided systems' })).toBeVisible();
});

test('Travel shows both blocks open at 1280px, with no fold controls', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAndGoto(page, './settings/travel');
  await page.waitForURL(/\/settings\/travel$/);

  await expect(page.getByRole('checkbox', { name: /EDENCOM/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Also avoid/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /avoided systems$/i })).toHaveCount(0);
});
