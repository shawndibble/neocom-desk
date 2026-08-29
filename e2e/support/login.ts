/** Drives the mocked SSO flow end to end, landing on /overview with Test Pilot active. */
import type { Page, Route } from '@playwright/test';
import { CHARACTER_NAME } from './fixtureData';

export async function loginAndSelectCharacter(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with EVE Online' }).click();
  await page.waitForURL(/\/characters$/);
  await page.getByRole('button', { name: `Select ${CHARACTER_NAME}` }).click();
  await page.waitForURL(/\/overview$/);
}

/**
 * Blocks every mocked external host from here on (route.abort, not
 * context.setOffline — that would also kill the localhost dev server, so a
 * subsequent reload couldn't even fetch index.html). Simulates "ESI/SSO/
 * images are unreachable" while the app itself keeps working.
 */
export async function goExternallyOffline(page: Page): Promise<void> {
  const disconnect = (route: Route) => route.abort('internetdisconnected');
  await page.route('https://esi.evetech.net/**', disconnect);
  await page.route('https://market.fuzzwork.co.uk/**', disconnect);
  await page.route('https://images.evetech.net/**', disconnect);
  await page.route('https://login.eveonline.com/**', disconnect);
}
