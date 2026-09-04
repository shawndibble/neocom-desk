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

  await page.getByRole('spinbutton', { name: 'Remaps available' }).fill('1');
  await page.getByRole('button', { name: 'Optimize remaps' }).click();

  // The verdict opens its own Accept/Reject Modal, mirroring "Suggest
  // reorder" — no longer inline in the tools pane's Actions section.
  const dialog = page.getByRole('dialog', { name: 'Optimize remaps' });
  await expect(dialog.getByText(/Remapping saves (?:\d+[dhm]\s*)+/)).toBeVisible();
  await expect(dialog.getByText('Segment 1')).toBeVisible();
  await expect(dialog.getByText(/remap to (?:[A-Z]{3} \d+ \/ ){4}[A-Z]{3} \d+/)).toBeVisible();
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

  // Closing the dialog returns focus to the "Import from clipboard" button in
  // the sidebar, and the browser scrolls that button into view. Once the
  // sidebar is taller than the viewport that button is below the fold, so the
  // page lands scrolled and every coordinate measured afterwards is off by
  // however far it went. Establish the precondition rather than assuming it:
  // this test is about a page sitting at its natural top.
  await page.evaluate(() => window.scrollTo(0, 0));

  // Real wheel scroll over the entries area, not a container scrollTop
  // assignment — the browser picks the scrolling ancestor the same way a
  // real user's scroll would, which a synthetic `el.scrollTop = n` can get
  // wrong (and did, while writing this test).
  //
  // Aim at the capped list itself, not an offset guessed from the heading
  // above it: `heading.y + height + 100` fell 10px short of the list's top
  // once the page scrolled, landing on the summary panel's chip row, so the
  // wheel went to the window and this test failed for a reason that had
  // nothing to do with the sticky panes it exists to protect. Exact class
  // match, for the same reason the overflow probe above uses one.
  const entriesHeading = page.getByRole('heading', { name: 'Your entries' });
  const scroller = page.locator('div[class="lg:overflow-y-auto"]');
  const box = await scroller.boundingBox();
  if (!box) throw new Error('expected the capped entry list to be visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(100);

  // The list is what consumed the wheel. Without this, everything below can
  // hold with nothing having scrolled anywhere — which is exactly how the
  // premise broke silently the first time.
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

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

  // And the summary strip stays pinned when the *window* scrolls, not just
  // when the capped list does. The entry list has its own cap, so what makes
  // the page taller than the viewport here is the sidebar itself (attributes,
  // What-If Implants, Booster) — the real case the sticky exists for. Firing
  // Optimize remaps is incidental setup at this point (its result now opens
  // its own Modal rather than growing the sidebar), kept only so the guard
  // below isn't the only thing exercising the click.
  await page.getByRole('spinbutton', { name: 'Remaps available' }).fill('1');
  await page.getByRole('button', { name: 'Optimize remaps' }).click();
  await expect(page.getByText(/^Remapping saves|^No remap improves/)).toBeVisible();

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
