/**
 * The wormhole "My ship fits" segmented control takes its natural width in
 * Settings › Travel but still fills Route Safety's narrow rules rail
 * (issue #3252).
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
];

for (const size of SIZES) {
  test(`Settings › Travel ship-size control is natural width at ${size.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await signInAndGoto(page, './settings/travel');
    const control = page.getByRole('group', { name: 'My ship fits' });
    await expect(control).toBeVisible({ timeout: 15000 });
    const panel = control.locator('xpath=ancestor::section[1]');
    const controlBox = (await control.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(controlBox.width).toBeLessThan(panelBox.width * 0.5);
  });

  test(`Route Safety ship-size control fills its rail at ${size.width}px`, async ({ page }) => {
    await page.route('https://esi.evetech.net/**/universe/system_kills*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.route('https://esi.evetech.net/**/universe/system_jumps*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.setViewportSize(size);
    await signInAndGoto(page, './travel/route');
    await page.getByRole('button', { name: /More route options/ }).click();
    const control = page.getByRole('group', { name: 'My ship fits' });
    await expect(control).toBeVisible({ timeout: 15000 });
    const container = control.locator('xpath=..');
    const controlBox = (await control.boundingBox())!;
    const containerBox = (await container.boundingBox())!;
    expect(controlBox.width).toBeGreaterThan(containerBox.width * 0.95);
  });
}
