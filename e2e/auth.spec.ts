import { test, expect } from './support/testBase';
import { CHARACTER_NAME, WALLET_BALANCE_FORMATTED } from './support/fixtureData';

// A phone, per #1771: what a newbie's first login looks like.
test.use({ viewport: { width: 390, height: 844 } });

test('first login via mocked EVE SSO lands straight on the overview wallet', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/login$/);
  // Unlike RTL's getByText (exact by default), Playwright's matches
  // substrings — the permissions-hint paragraph also mentions "Neocom Desk".
  await expect(page.getByText('Neocom Desk', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /answers, not api dumps/i })).toBeVisible();

  // The landing page repeats this CTA (hero + closing band) — .first() is the
  // hero button, the one actually in view on load.
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();

  /*
   * authorize -> mocked 302 -> /callback -> token exchange -> /overview (a
   * first-ever login has one Character, so there is nothing to pick — #1771).
   *
   * The 302 is a real navigation, so the app boots from scratch on the way —
   * and `expect().toHaveURL` starts its clock immediately rather than waiting
   * for that load. Measured against the dev server with the suite's own
   * workers running, `responseEnd` is ~47ms while `loadEventEnd` is ~5.5s:
   * Vite serves the document at once and then transforms a few hundred modules
   * while every other worker asks it for the same thing. The token exchange
   * itself is the last ~0.4s.
   *
   * So the default 5s budget was being spent almost entirely on startup, and
   * the assertion raced it — passing or failing on how loaded the machine was.
   * Waiting for the load first splits the two: this line covers the boot on
   * its own generous navigation budget, and the assertion below is left
   * covering what it names.
   */
  await page.waitForLoadState('load');
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: CHARACTER_NAME })).toBeVisible();
  await expect(page.getByText(`${WALLET_BALANCE_FORMATTED} ISK`)).toBeVisible();
});
