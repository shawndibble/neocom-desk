/**
 * Mail reading pane on a phone (issue #1054): `useViewportBoundedHeight`
 * sizes the body scroller off the raw viewport height, with no knowledge of
 * `Layout.tsx`'s fixed mobile tab bar below `md`. `Mail.tsx` applied that
 * height unconditionally, so a mail long enough to fill the pane had its
 * last lines sit behind the opaque tab bar with no further scroll to reach
 * them. The fix gates the computed max-height to desktop only (the same
 * pattern `PlanEditor.tsx` already ships for the same hook) — on phone the
 * body falls back to normal document flow, which `Layout.tsx`'s bottom
 * padding already clears.
 *
 * A long body is seeded via `page.route` overrides on the mail
 * headers/body endpoints (mockEsi.ts's defaults are empty), then the
 * reading pane is scrolled to its last line and checked against the fixed
 * tab bar's own bounding box.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };

const MAIL_ID = 1;
const END_MARKER = 'END-OF-MAIL-MARKER';
// Comfortably taller than one phone screen at 390x844.
const LONG_BODY = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of the mail body.`).join(
  '\n'
);

async function seedLongMail(page: Page, subject = 'A very long mail'): Promise<void> {
  // Not covered by mockEsi.ts's `PREFETCHED_EMPTY` set (that only mocks the
  // boot-time `/mail` headers prefetch) — `Mail.tsx` itself also fetches the
  // mailing-lists endpoint on mount, which otherwise escapes to the network
  // guard the moment a spec actually visits `/mail`.
  await page.route(`**/characters/${CHARACTER_ID}/mail/lists`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route(`**/characters/${CHARACTER_ID}/mail`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          mail_id: MAIL_ID,
          subject,
          timestamp: '2026-01-01T00:00:00Z',
          is_read: true,
        },
      ]),
    })
  );
  await page.route(`**/characters/${CHARACTER_ID}/mail/${MAIL_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subject,
        timestamp: '2026-01-01T00:00:00Z',
        body: `${LONG_BODY}\n${END_MARKER}`,
        read: true,
      }),
    })
  );
}

test('reading pane: last line of a long mail is reachable above the fixed tab bar at 390px', async ({
  page,
}) => {
  await seedLongMail(page);
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './mail');

  await page.getByText('A very long mail').click();

  const marker = page.getByText(END_MARKER);
  await expect(marker).toBeVisible();

  // The whole body is one `white-space: pre-wrap` paragraph (real newlines,
  // not separate elements), so `marker` resolves to that entire block —
  // `scrollIntoViewIfNeeded` would bring its *top* into view with the least
  // possible scroll, not its end. A phone reader scrolls the page itself to
  // the end, which on the fixed page is exactly what this fix restores.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const tabBar = page.getByRole('navigation', { name: 'Mobile navigation' });
  const [markerBox, tabBarBox] = await Promise.all([marker.boundingBox(), tabBar.boundingBox()]);

  expect(markerBox).not.toBeNull();
  expect(tabBarBox).not.toBeNull();
  expect(markerBox!.y + markerBox!.height).toBeLessThanOrEqual(tabBarBox!.y);
});

// Issue #1969: an unbroken long token in the subject clipped at the pane edge.
test('reading pane: subject with a long unbroken token wraps at 390px', async ({ page }) => {
  const subject =
    'Re: Fwd: URGENT_CORP_WIDE_ANNOUNCEMENT_ABOUT_DOCTRINE_CHANGES_AND_FLEET_SCHEDULE_2026';
  await seedLongMail(page, subject);
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './mail');

  await page.getByText(subject).click();

  const heading = page.getByRole('heading', { name: subject });
  await expect(heading).toBeVisible();
  const fits = await heading.evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
});

// Issue #2106: Reply/Forward were the sole touch targets for an open mail
// below `md` (no side-by-side list to fall back on), but rendered at the
// `sm` tier (36px) on phone — below the app's 44px touch floor.
test('reading pane: Reply/Forward meet the 44px touch target floor at 390px', async ({ page }) => {
  await seedLongMail(page);
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './mail');

  await page.getByText('A very long mail').click();

  const reply = page.getByRole('button', { name: 'Reply' });
  const forward = page.getByRole('button', { name: 'Forward' });
  const [replyBox, forwardBox] = await Promise.all([reply.boundingBox(), forward.boundingBox()]);

  expect(replyBox).not.toBeNull();
  expect(forwardBox).not.toBeNull();
  expect(replyBox!.height).toBeGreaterThanOrEqual(44);
  expect(forwardBox!.height).toBeGreaterThanOrEqual(44);

  // Pointer-width behavior must stay put: `size="row"` keeps the same
  // `md:size-7` pointer height `size="sm"` already had, unlike `size="md"`
  // which would have widened it from 28px to 36px above `md` (768px).
  await page.setViewportSize({ width: 1024, height: 800 });
  const [replyDesktopBox, forwardDesktopBox] = await Promise.all([
    reply.boundingBox(),
    forward.boundingBox(),
  ]);
  expect(replyDesktopBox).not.toBeNull();
  expect(forwardDesktopBox).not.toBeNull();
  expect(replyDesktopBox!.height).toBeCloseTo(28, 0);
  expect(forwardDesktopBox!.height).toBeCloseTo(28, 0);
});
