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

test('sticky plan summary and toolbar stack without overlap once the entries queue scrolls (#221 regression)', async ({
  page,
}) => {
  // A prior fix's `top` offset was a hand-derived constant that went stale
  // the moment the summary strip's rendered height changed, so the toolbar
  // overlapped it once actually scrolled — invisible at rest, only visible
  // once the entries queue genuinely overflows its box. Needs enough
  // entries to overflow SkillPlanEditor's `lg:max-h-[32rem]` (512px) box.
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

  // The whole Panel `<section>`, not just its `<header>` title bar (`..`
  // only reaches the immediate parent, i.e. the header) — the chip row/
  // toolbar controls that actually matter for this overlap check live in a
  // sibling of `<header>`, further up the tree.
  const summaryPanel = page
    .getByRole('heading', { name: 'Plan summary' })
    .locator('xpath=ancestor::section[1]');
  const toolbarPanel = page
    .getByRole('heading', { name: 'Toolbar' })
    .locator('xpath=ancestor::section[1]');

  // Confirm the setup actually overflows the box this bug depends on
  // (SkillPlanEditor.tsx's `lg:max-h-[32rem]`, 512px) — otherwise the wheel
  // scroll below has nothing to do and this test would pass vacuously
  // regardless of the bug. `lg:` is load-bearing in the match: an unrelated
  // element elsewhere on the page carries the un-prefixed `max-h-[32rem]`.
  await expect(async () => {
    const overflowed = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>('div')).find((d) =>
        d.className.includes('lg:max-h-[32rem]')
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

  await expect(summaryPanel).toBeInViewport();
  await expect(toolbarPanel).toBeInViewport();
  const summaryBox = await summaryPanel.boundingBox();
  const toolbarBox = await toolbarPanel.boundingBox();
  if (!summaryBox || !toolbarBox) throw new Error('expected both panels to have a layout box');
  // Toolbar starts at or after the summary strip's bottom edge (a small
  // rounding allowance, not a gap requirement) — this is what overlap
  // failing would violate.
  expect(toolbarBox.y).toBeGreaterThanOrEqual(summaryBox.y + summaryBox.height - 1);
});
