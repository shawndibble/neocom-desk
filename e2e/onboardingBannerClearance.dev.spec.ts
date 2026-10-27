/**
 * The onboarding banner must not cover the keyboard-focused control (WCAG
 * 2.4.11 Focus Not Obscured). Asserted on rendered bounding boxes while
 * tabbing through /settings/notifications with the banner showing.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_NAME } from './support/fixtureData';

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`banner never fully covers the focused control at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(Notification, 'permission', {
        get: () => 'default',
        configurable: true,
      })
    );
    await page.setViewportSize(viewport);
    await signInAndGoto(page, './overview');
    await expect(page.getByRole('heading', { name: CHARACTER_NAME })).toBeVisible();
    await page.goto('./settings/notifications');
    const banner = page.getByTestId('onboarding-banner');
    await expect(banner).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.style.getPropertyValue('--onboarding-banner-clearance')
        )
      )
      .not.toBe('');

    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const covered = await page.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const el = document.activeElement as HTMLElement | null;
        const bar = document.querySelector('[data-testid="onboarding-banner"]');
        if (!el || !bar || bar.contains(el)) return false;
        const a = el.getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        return a.top >= b.top && a.bottom <= b.bottom && a.left >= b.left && a.right <= b.right;
      });
      expect(covered, `Tab ${i + 1} landed under the banner`).toBe(false);
    }
  });
}

for (const { viewport, expected } of [
  { viewport: { width: 1280, height: 720 }, expected: 'auto' },
  { viewport: { width: 390, height: 844 }, expected: '56px' },
]) {
  test(`no bar mounted: scroll-padding-bottom is ${expected} at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(Notification, 'permission', {
        get: () => 'granted',
        configurable: true,
      })
    );
    await page.setViewportSize(viewport);
    await signInAndGoto(page, './overview');
    await expect(page.getByRole('heading', { name: CHARACTER_NAME })).toBeVisible();
    await expect(page.getByTestId('onboarding-banner')).toHaveCount(0);
    const value = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollPaddingBottom
    );
    expect(value).toBe(expected);
  });
}
