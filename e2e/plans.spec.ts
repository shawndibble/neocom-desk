import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { addCaldariCruiserToNewPlan } from './support/planHelpers';

test.beforeEach(async ({ page }) => {
  await loginAndSelectCharacter(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.waitForURL(/\/skills$/);
  await page.getByRole('link', { name: 'Plans' }).click();
  await page.waitForURL(/\/skills\/plans$/);
});

test('create a plan, add a skill, see the computed queue with prereqs and times', async ({
  page,
}) => {
  await addCaldariCruiserToNewPlan(page);

  // Computed queue: prereq chain inserted ahead of the entry the user actually asked for.
  const queue = page.locator('ul', { hasText: 'Caldari Cruiser I' });
  // Row text is "<name> <roman>Prereq" with no space before "Prereq", so
  // "Spaceship Command I" alone would also match the "...II" row; exclude it.
  await expect(queue.getByText(/Spaceship Command I(?!I)/)).toBeVisible();
  await expect(queue.getByText('Caldari Destroyer III')).toBeVisible();
  await expect(queue.getByText('Prereq').first()).toBeVisible();
  // Non-zero training time rendered per row and as a running total.
  await expect(queue.getByText(/\d+[dhm]/).first()).toBeVisible();
});

test('exports the computed queue to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await addCaldariCruiserToNewPlan(page);

  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'Export to clipboard' }).click();
  await expect(page.getByText('Copied to clipboard')).toBeVisible();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(
    [
      'Spaceship Command I',
      'Spaceship Command II',
      'Caldari Destroyer I',
      'Caldari Destroyer II',
      'Caldari Destroyer III',
      'Caldari Cruiser I',
    ].join('\n')
  );
});

test('optimize remaps shows attribute segments and savings', async ({ page }) => {
  await addCaldariCruiserToNewPlan(page);

  await page.getByRole('spinbutton', { name: 'Remaps available' }).fill('1');
  await page.getByRole('button', { name: 'Optimize remaps' }).click();

  const resultPanel = page.getByRole('heading', { name: 'Optimize remaps' }).locator('../..');
  await expect(resultPanel.getByText(/Remapping saves (?:\d+[dhm]\s*)+/)).toBeVisible();
  await expect(resultPanel.getByText('Segment 1')).toBeVisible();
  await expect(resultPanel.getByText(/remap to (?:[A-Z]{3} \d+ \/ ){4}[A-Z]{3} \d+/)).toBeVisible();
});
