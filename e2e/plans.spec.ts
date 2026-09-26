import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { addCaldariCruiserToNewPlan } from './support/planHelpers';

test.beforeEach(async ({ page }) => {
  await signInAndGoto(page);
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

  // Chromium rewrites the LF the app writes as CRLF on the Windows
  // system-clipboard round trip, so readText() hands back CRLF-separated text
  // there and LF-separated text on the Linux CI runner. Normalize here rather
  // than in the app: the export engine emits LF by contract, pinned by
  // src/engine/clipboardExport.test.ts.
  const rawClipboardText = await page.evaluate(() => navigator.clipboard.readText());
  const clipboardText = rawClipboardText.replace(/\r\n/g, '\n');

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

  // No manual remap count any more — CHARACTER_ATTRIBUTES has no bonus
  // remaps and no cooldown, so the live budget already reads 1 (the yearly
  // remap, ready).
  await page.getByRole('button', { name: 'Optimize' }).click();
  await page.getByRole('menuitem', { name: 'Place remaps only' }).click();

  // The verdict opens its own Accept/Reject Modal, mirroring "Suggest
  // reorder" — no longer inline in the tools pane's Actions section.
  const dialog = page.getByRole('dialog', { name: 'Optimize remaps' });
  await expect(dialog.getByText(/Remapping saves (?:\d+[dhm]\s*)+/)).toBeVisible();
  await expect(dialog.getByText('Segment 1')).toBeVisible();
  await expect(dialog.getByText(/remap to (?:[A-Z]{3} \d+ \/ ){4}[A-Z]{3} \d+/)).toBeVisible();
});

test('"Optimize for me" reorders and places remaps in one preview; Accept applies both (#1411)', async ({
  page,
}) => {
  await addCaldariCruiserToNewPlan(page);

  // No manual remap count any more — CHARACTER_ATTRIBUTES has no bonus
  // remaps and no cooldown, so the live budget already reads 1 (the yearly
  // remap, ready).
  await page.getByRole('button', { name: 'Optimize' }).click();
  await page.getByRole('menuitem', { name: 'Optimize for me' }).click();

  const dialog = page.getByRole('dialog', { name: 'Optimize for me' });
  await expect(dialog.getByText(/^Total (?:\d+[dhm]\s*)+→ (?:\d+[dhm]\s*)+/)).toBeVisible();
  await expect(dialog.getByText('Segment 1')).toBeVisible();

  await dialog.getByRole('button', { name: 'Accept' }).click();
  await expect(dialog).not.toBeVisible();
});

test('"Shortest first" pulls a quick standalone skill ahead of the slow Caldari Cruiser chain', async ({
  page,
}) => {
  await addCaldariCruiserToNewPlan(page);

  // "Social" (rank 1, no prereqs) trains far faster than the rest of the
  // Caldari Cruiser chain still to come (Spaceship Command II, Caldari
  // Destroyer I-III, Caldari Cruiser I), so it should surface ahead of them.
  await page.getByPlaceholder('Search skills…').fill('Social');
  await page.getByRole('button', { name: /^Social/ }).click();
  await page.getByRole('button', { name: 'Level I', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Social' })).toBeVisible();

  await page.getByRole('button', { name: 'Optimize' }).click();
  await page.getByRole('menuitem', { name: 'Shortest first' }).click();

  const dialog = page.getByRole('dialog', { name: 'Suggested shortest-first sort' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Accept' }).click();
  await expect(dialog).not.toBeVisible();

  const queue = page.locator('ul', { hasText: 'Caldari Cruiser I' });
  const rows = await queue.locator('li').allTextContents();
  const socialIndex = rows.findIndex((row) => row.includes('Social I'));
  const cruiserIndex = rows.findIndex((row) => row.includes('Caldari Cruiser I'));
  expect(socialIndex).toBeGreaterThanOrEqual(0);
  expect(socialIndex).toBeLessThan(cruiserIndex);
});

test('a long plan scrolls the page, with the summary strip pinned above it', async ({ page }) => {
  // The entry list used to carry its own viewport-measured cap (#237), which
  // beside a sidebar taller than the viewport put two scrollbars on screen.
  // Now the page is the only scroller and the summary strip (`lg:sticky`)
  // is what stays put.
  await addCaldariCruiserToNewPlan(page);
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('menuitem', { name: 'From text or file…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import plan' });
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

  // No nested scroller: the entries grow the page instead.
  await expect(page.locator('div[class="lg:overflow-y-auto"]')).toHaveCount(0);

  const summaryPanel = page
    .getByText('Projected finish')
    .first()
    .locator('xpath=ancestor::section[1]');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(100);

  // Guard against a vacuous pass: if the page cannot actually scroll, the
  // assertions below hold whether or not the strip is sticky at all.
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await expect(summaryPanel).toBeInViewport();
  const summaryBox = await summaryPanel.boundingBox();
  if (!summaryBox) throw new Error('expected the summary strip to have a layout box');
  expect(summaryBox.y).toBeLessThan(200);
});
