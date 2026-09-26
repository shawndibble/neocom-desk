/**
 * Phone identity avatar placement in `PageHeader`. Below `md` it must be the
 * header's top-right corner on every route: right of every action, and on
 * the title's own line even when the actions wrap to a second one. It used
 * to sit *first* in the actions cluster, so it moved route to route with
 * however many actions came after it, and dropped a line with them on wrap.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, CHARACTER_NAME } from './support/fixtureData';

const ROUTES = ['./mail', './calendar', './market', './fittings'];
const WIDTHS = [390, 320];

async function expectAvatarTopRight(page: Page): Promise<{ headerHeight: number }> {
  const header = page.locator('main header').first();
  const heading = header.getByRole('heading', { level: 1 });
  const avatar = header.getByRole('link', { name: `${CHARACTER_NAME}, switch character` });
  await expect(avatar).toBeVisible();

  const headerBox = (await header.boundingBox())!;
  const headingBox = (await heading.boundingBox())!;
  const avatarBox = (await avatar.boundingBox())!;

  // Flush with the header's right edge.
  expect(Math.abs(headerBox.x + headerBox.width - (avatarBox.x + avatarBox.width))).toBeLessThan(2);
  // On the title's first line: its vertical centre falls within the heading's
  // first line of text.
  const avatarMid = avatarBox.y + avatarBox.height / 2;
  expect(avatarMid).toBeGreaterThan(headingBox.y);
  expect(avatarMid).toBeLessThan(headingBox.y + Math.min(headingBox.height, 40));

  // Every other control ends left of it.
  const controls = header.locator('button, a').filter({ hasNot: page.locator('img') });
  for (const box of await controls.evaluateAll((els) =>
    els
      .filter((el) => !el.getAttribute('aria-label')?.endsWith('switch character'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => ({ right: r.right }))
  )) {
    expect(box.right).toBeLessThanOrEqual(avatarBox.x + 1);
  }
  return { headerHeight: headerBox.height };
}

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    test(`${route} at ${width}px: avatar is the header's top-right corner`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      // Mail fetches its mailing lists on mount; mockEsi.ts doesn't cover them.
      await page.route(`**/characters/${CHARACTER_ID}/mail/lists`, (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      );
      await signInAndGoto(page, route);
      await expectAvatarTopRight(page);
    });
  }
}

// The two paths the loop above can't tell apart: actions that fit stay on the
// title's line (no extra row), and actions that don't wrap below it.
test('actions that fit stay on one row with the avatar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`**/characters/${CHARACTER_ID}/mail/lists`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await signInAndGoto(page, './mail');
  const { headerHeight } = await expectAvatarTopRight(page);
  expect(headerHeight).toBeLessThan(50);
});

test('actions that wrap leave the title and avatar on row one', async ({ page }) => {
  // Calendar's three actions don't fit beside its title at 320px.
  await page.setViewportSize({ width: 320, height: 844 });
  await signInAndGoto(page, './calendar');
  const { headerHeight } = await expectAvatarTopRight(page);
  expect(headerHeight).toBeGreaterThan(60);
});
