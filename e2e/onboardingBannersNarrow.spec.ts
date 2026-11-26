import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_NAME } from './support/fixtureData';

test.use({
  userAgent:
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
});

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

async function makeInstallPromptEligible(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    });
    window.dispatchEvent(event);
  });
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

  const alerts = page.getByRole('alert');
  await makeInstallPromptEligible(page);
  await expect(alerts).toHaveCount(1);
  await expect(page.getByTestId('onboarding-banner')).toContainText('Install Neocom Desk');
  await expect(page.getByText('Turn on notifications?')).toHaveCount(0);

  await page.getByRole('button', { name: 'Alerts, none waiting' }).click();
  const explainer = page.getByRole('dialog').getByText('Turn on notifications?');
  await expect(explainer).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(explainer).toBeHidden();
});
