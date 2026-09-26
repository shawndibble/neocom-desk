/**
 * One onboarding banner at a time on a phone (issue #1124).
 *
 * The three one-time banners are all `position: fixed` in the same bottom
 * corner, each with its own offset, so a first login on a fresh device
 * stacked two or three of them up the viewport and buried the page content
 * behind them at 390x844. They now share a single slot
 * (`src/app/onboardingBannerSlot.ts`): the highest-priority eligible one
 * renders, and the next one down only appears once that one is gone.
 *
 * The pair fabricated here is notifications + install, the two reachable
 * without a Director-tier character: `Notification.permission` is pinned to
 * 'default' (headless Chromium reports 'denied', which suppresses the
 * explainer by design), and a synthetic `beforeinstallprompt` satisfies the
 * install banner's native variant the same way a real Chromium would.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };

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

test('shows one onboarding banner at a time at 390px, then the next one', async ({ page }) => {
  await pinNotificationPermissionToDefault(page);
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './overview');
  // issue #1788: the explainer now waits for a second route so it never
  // competes with the very first screen a new player sees.
  await page.goto('./characters');

  // Counted as the AC words it: every `role="alert"` on the page, so a future
  // fixed banner that regresses the rule without opting into the shared
  // testid still fails this. The testid only says which banner is showing.
  const alerts = page.getByRole('alert');
  const banners = page.getByTestId('onboarding-banner');
  const notificationBanner = banners.filter({ hasText: 'Turn on notifications?' });

  // Both are eligible from here on: the notification explainer has never been
  // offered on this fresh profile, and the install banner now holds a
  // deferred prompt.
  await expect(notificationBanner).toBeVisible();
  await makeInstallPromptEligible(page);

  // Priority order — notifications outrank install, and install must not
  // appear alongside it.
  await expect(alerts).toHaveCount(1);
  await expect(notificationBanner).toBeVisible();

  // Dismissing the winner hands the slot to the next-highest eligible banner.
  await notificationBanner.getByRole('button', { name: 'Not now' }).click();
  await expect(notificationBanner).toBeHidden();
  await expect(alerts).toHaveCount(1);
  await expect(banners.first()).toContainText('Install Neocom Desk');
});
