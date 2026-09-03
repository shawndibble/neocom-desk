import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { addCaldariCruiserToNewPlan } from './support/planHelpers';

test.beforeEach(async ({ page }) => {
  await loginAndSelectCharacter(page);
  // The rail's Skills link lands on the plan list directly: /skills redirects.
  await page.getByRole('link', { name: 'Skills' }).click();
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

  // The verdict renders inline in the tools pane's Actions section, under
  // the button that produced it.
  const resultPanel = page
    .getByRole('heading', { name: 'Actions' })
    .locator('xpath=ancestor::section[1]');
  await expect(resultPanel.getByText(/Remapping saves (?:\d+[dhm]\s*)+/)).toBeVisible();
  await expect(resultPanel.getByText('Segment 1')).toBeVisible();
  await expect(resultPanel.getByText(/remap to (?:[A-Z]{3} \d+ \/ ){4}[A-Z]{3} \d+/)).toBeVisible();
});

test('the plan summary and tools stay in view while the entries queue scrolls (#221 successor)', async ({
  page,
}) => {
  // The pane used to pin two panels — the summary strip and a toolbar below
  // it — whose `top` offsets had to be derived from each other's rendered
  // height, and overlapped whenever that derivation went stale (#221/#229).
  // Only the entry list is capped now, so the strip above it and the tools
  // beside it stay put structurally, with nothing to keep in sync. Needs
  // enough entries to actually overflow that cap, which is measured against
  // the live viewport height (#237), not a flat constant.
  await addCaldariCruiserToNewPlan(page);
  await page.getByRole('button', { name: 'Import from clipboard' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from clipboard' });
  await dialog
    .getByLabel(/paste an eft fit or a skill plan/i)
    .fill(
      [
        'Spaceship Command III',
        'Mechanics III',
        'Hull Upgrades III',
        'Shield Management III',
        'Long Range Targeting III',
        'Signature Analysis III',
        'Electronics III',
        'Engineering III',
        'Navigation III',
        'Warp Drive Operation III',
        'Afterburner III',
        'High Speed Maneuvering III',
        'Weapon Upgrades III',
        'Advanced Weapon Upgrades III',
        'Gunnery III',
      ].join('\n')
    );
  await dialog.getByRole('button', { name: 'Parse' }).click();
  await expect(dialog.getByText('Detected: skill plan')).toBeVisible();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();

  // Confirm the setup actually overflows the capped list — otherwise the
  // wheel scroll below has nothing to do and this test would pass vacuously.
  // Exact class match: other elements combine `overflow-y-auto` with more
  // utility classes.
  await expect(async () => {
    const overflowed = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>('div')).find(
        (d) => d.className.trim() === 'lg:overflow-y-auto'
      );
      return !!el && el.scrollHeight > el.clientHeight + 50;
    });
    expect(overflowed).toBe(true);
  }).toPass();

  // Real wheel scroll over the entries area, not a container scrollTop
  // assignment — the browser picks the scrolling ancestor the same way a
  // real user's scroll would, which a synthetic `el.scrollTop = n` can get
  // wrong (and did, while writing this test).
  const entriesHeading = page.getByRole('heading', { name: 'Your entries' });
  const box = await entriesHeading.boundingBox();
  if (!box) throw new Error('expected Your entries panel to be visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 100);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(100);

  // The list scrolled inside its own box, so everything framing it is still
  // on screen: the summary strip above, the panel's own header, and the
  // tools sidebar beside it.
  const summaryPanel = page
    .getByRole('heading', { name: 'Plan summary' })
    .locator('xpath=ancestor::section[1]');
  await expect(summaryPanel).toBeInViewport();
  await expect(entriesHeading).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Plan tools' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Optimize remaps' })).toBeInViewport();

  // And the summary strip never ends up overlapped by what follows it.
  const summaryBox = await summaryPanel.boundingBox();
  const entriesBox = await entriesHeading.boundingBox();
  if (!summaryBox || !entriesBox) throw new Error('expected both to have a layout box');
  expect(entriesBox.y).toBeGreaterThanOrEqual(summaryBox.y + summaryBox.height - 1);
});
