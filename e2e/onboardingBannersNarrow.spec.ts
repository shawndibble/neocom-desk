/**
 * One onboarding banner at a time on a phone (issue #1124).
 *
 * The one-time banners are all `position: fixed` in the same bottom
 * corner, each with its own offset, so a first login on a fresh device
 * stacked two of them up the viewport and buried the page content
 * behind them at 390x844. They now share a single slot
 * (`src/app/onboardingBannerSlot.ts`): the highest-priority eligible one
 * renders, and the next one down only appears once that one is gone.
 *
 * The notification explainer is no longer one of them: it opens with the
 * bell's alerts panel. `Notification.permission` is pinned to 'default'
 * (headless Chromium reports 'denied', which suppresses the explainer by
 * design), and a synthetic `beforeinstallprompt` satisfies the
 * install banner's native variant the same way a real Chromium would. The
 * Install Prompt is mobile-only, so the page also has to claim to be
 * Android Chrome — headless Chromium's desktop UA would hide it. It also
 * waits for five page visits after login, so the profile is seeded past that.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_NAME } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };

test.use({
  userAgent:
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
});

/**
 * Headless Chromium answers 'denied' for notifications, and a denied grant
 * can never be re-requested from JS — so the explainer correctly hides. Pin
 * the live read to what a real first-run browser reports instead.
 */
async function pinNotificationPermissionToDefault(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', {
      get: () => 'default',
      configurable: true,
    });
  });
}

/** Fires the event Chromium raises when the app is installable. */
async function makeInstallPromptEligible(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    });
    window.dispatchEvent(event);
  });
  // Two frames, so React has certainly processed the event, re-rendered and
  // run the slot effect. Without this the count assertion below would run in
  // the gap before a second banner could ever mount, and would pass against
  // an implementation that does no arbitration at all.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

test('shows the install banner alone, and the notification explainer only from the bell', async ({
  page,
}) => {
  await pinNotificationPermissionToDefault(page);
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './overview', undefined, [
    { key: 'installPrompt.pageVisits', value: 5 },
  ]);
  await expect(page.getByRole('heading', { name: CHARACTER_NAME })).toBeVisible();

  // Counted as the AC words it: every `role="alert"` on the page, so a future
  // fixed banner that regresses the rule without opting into the shared
  // testid still fails this.
  const alerts = page.getByRole('alert');
  await makeInstallPromptEligible(page);
  await expect(alerts).toHaveCount(1);
  await expect(page.getByTestId('onboarding-banner')).toContainText('Install Neocom Desk');
  // The permission explainer is not a banner: nothing asks until the bell opens.
  await expect(page.getByText('Turn on notifications?')).toHaveCount(0);

  await page.getByRole('button', { name: 'Alerts, none waiting' }).click();
  const explainer = page.getByRole('dialog').getByText('Turn on notifications?');
  await expect(explainer).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(explainer).toBeHidden();
});
