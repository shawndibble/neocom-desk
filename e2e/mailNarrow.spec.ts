import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const MAIL_ID = 1;
const END_MARKER = 'END-OF-MAIL-MARKER';
const LONG_BODY = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of the mail body.`).join(
  '\n'
);

async function seedLongMail(page: Page, subject = 'A very long mail'): Promise<void> {
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

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const tabBar = page.getByRole('navigation', { name: 'Mobile navigation' });
  const [markerBox, tabBarBox] = await Promise.all([marker.boundingBox(), tabBar.boundingBox()]);

  expect(markerBox).not.toBeNull();
  expect(tabBarBox).not.toBeNull();
  expect(markerBox!.y + markerBox!.height).toBeLessThanOrEqual(tabBarBox!.y);
});

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

test('reading pane: Reply/Forward meet the 36px touch target floor at 390px', async ({ page }) => {
  await seedLongMail(page);
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './mail');

  await page.getByText('A very long mail').click();

  const reply = page.getByRole('button', { name: 'Reply' });
  const forward = page.getByRole('button', { name: 'Forward' });
  const [replyBox, forwardBox] = await Promise.all([reply.boundingBox(), forward.boundingBox()]);

  expect(replyBox).not.toBeNull();
  expect(forwardBox).not.toBeNull();
  expect(replyBox!.height).toBeGreaterThanOrEqual(36);
  expect(forwardBox!.height).toBeGreaterThanOrEqual(36);

  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(reply).toBeVisible();
  await expect(forward).toBeVisible();
  const [replyDesktopBox, forwardDesktopBox] = await Promise.all([
    reply.boundingBox(),
    forward.boundingBox(),
  ]);
  expect(replyDesktopBox).not.toBeNull();
  expect(forwardDesktopBox).not.toBeNull();
  expect(replyDesktopBox!.height).toBeCloseTo(28, 0);
  expect(forwardDesktopBox!.height).toBeCloseTo(28, 0);
});

test('New Mail: a tap in the empty middle of the message box focuses the editor at 390px', async ({
  page,
}) => {
  await seedLongMail(page);
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './mail');

  await page.getByRole('button', { name: 'Compose' }).click();
  const dialog = page.getByRole('dialog', { name: 'New mail' });
  const card = dialog.locator('[data-mail-card]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('toolbar')).toBeVisible();

  const box = (await card.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(dialog.getByRole('textbox', { name: 'Message' })).toBeFocused();
});

test('Reply: the editable fills the message box, so a tap anywhere in it lands in it at 390px', async ({
  page,
}) => {
  await seedLongMail(page);
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './mail');

  await page.getByText('A very long mail').click();
  await page.getByRole('button', { name: 'Reply' }).click();
  const card = page.locator('[data-mail-card]');
  await expect(card.getByRole('toolbar')).toBeVisible();
  const editor = card.getByRole('textbox', { name: 'Message' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');

  const gap = await editor.evaluate((el) => {
    const surface = el.parentElement!.parentElement!;
    return surface.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom;
  });
  expect(gap).toBeLessThan(16);
});
