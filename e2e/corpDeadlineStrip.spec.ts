/**
 * The Deadline Strip's day labels at 1024px (issue #2201).
 *
 * `CorpStanding`'s hero figures and the strip shared one `flex-wrap` row from
 * `lg` (1024px) up, and a flex item's wrap contribution is its max-content
 * width — the strip's `min-w-0 flex-1` columns never forced a wrap on their
 * own, so the row squeezed all fourteen columns to ~11px each at exactly
 * 1024px instead of dropping the strip to its own row. `corpBoardNarrow.spec.ts`
 * checks the *page* never overflows; that check would not have caught this,
 * since `truncate` clips inside each label rather than overflowing the page.
 * This asserts the labels themselves: `scrollWidth` must not exceed
 * `clientWidth` on any rendered day label.
 *
 * Reuses `corpBoardNarrow.spec.ts`'s corp-scoped token and ESI mocks — the
 * mocked structure's `fuel_expires` is itself a board item with a deadline,
 * which is what populates the strip — and adds an `Accountant` role plus
 * wallet mocks so all three hero figures render (Due Soon, Runway, Net):
 * the clipping only reproduces with the full-width figures block the issue
 * describes, not with the single Due Soon figure `Station_Manager` alone
 * gets, which left the strip enough of the row to render unclipped even on
 * the pre-fix layout.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import {
  CHARACTER_NAME,
  CHARACTER_ID,
  CORPORATION_ID,
  OWNER_HASH,
  SCOPES,
} from './support/fixtureData';
import { scopesForGroup } from '../src/esi/scopes';

/** Far-future expiry, matching `mockSso.ts`'s own mocked token. */
const EXP_SECONDS = 4_102_444_800;

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makeAccessTokenWithCorpScopes(): string {
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const payload = base64url({
    sub: `CHARACTER:EVE:${CHARACTER_ID}`,
    name: CHARACTER_NAME,
    owner: OWNER_HASH,
    exp: EXP_SECONDS,
    scp: [...SCOPES, ...scopesForGroup('corp')],
    iss: 'login.eveonline.com',
  });
  return `${header}.${payload}.fakesig`;
}

async function signInWithMockedDeadline(page: Page) {
  await page.route('https://login.eveonline.com/v2/oauth/token', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: makeAccessTokenWithCorpScopes(),
        token_type: 'Bearer',
        expires_in: 1199,
        refresh_token: 'fake-refresh',
      }),
    });
  });

  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (path === `/characters/${CHARACTER_ID}/roles`) {
      return json({ roles: ['Station_Manager', 'Accountant'] });
    }
    if (path === `/corporations/${CORPORATION_ID}/structures`) {
      return json([
        {
          structure_id: 1,
          corporation_id: CORPORATION_ID,
          system_id: 1,
          type_id: 1,
          profile_id: 1,
          name: 'Nakugard - Home Sweet Home Fortizar Citadel Deployment Alpha',
          fuel_expires: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        },
      ]);
    }
    if (path === `/corporation/${CORPORATION_ID}/mining/extractions`) return json([]);
    if (path === `/corporations/${CORPORATION_ID}/wallets`) {
      return json([{ division: 1, balance: 1_000_000_000 }]);
    }
    if (path === `/corporations/${CORPORATION_ID}/divisions`) {
      return json({ wallet: [{ division: 1, name: 'Master Wallet' }], hangar: [] });
    }
    if (path === `/corporations/${CORPORATION_ID}/wallets/1/journal`) return json([]);

    await route.fallback();
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto('./corp');
}

async function widestLabelOverflow(page: Page) {
  return page.evaluate(() => {
    // Scoped to the strip's own `role="img"` bars container, identified by
    // its `aria-label` (both the empty and non-empty variants start with
    // "Deadlines per day") — a bare `[role="img"]` also matches the
    // character portrait `<img>` elsewhere on the page, which has no
    // `span.truncate` descendants and would silently report zero labels.
    const strip = document.querySelector('[role="img"][aria-label^="Deadlines per day"]');
    const labels = strip
      ? (Array.from(strip.querySelectorAll('span.truncate')) as HTMLElement[])
      : [];
    const overflowing = labels
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => `"${el.textContent}" @ ${el.scrollWidth}px in ${el.clientWidth}px`);
    return { count: labels.length, overflowing };
  });
}

test.describe('corp overview — Deadline Strip day labels', () => {
  test('do not clip at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await signInWithMockedDeadline(page);

    const strip = page.locator('[role="img"][aria-label^="Deadlines per day"]');
    await expect(strip).toBeVisible();

    const { count, overflowing } = await widestLabelOverflow(page);
    expect(count, 'expected the Deadline Strip to render day labels').toBeGreaterThan(0);
    expect(overflowing, `clipped labels: ${overflowing.join(', ')}`).toEqual([]);
  });

  test('still readable at 1440px (no regression)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithMockedDeadline(page);

    const strip = page.locator('[role="img"][aria-label^="Deadlines per day"]');
    await expect(strip).toBeVisible();

    const { count, overflowing } = await widestLabelOverflow(page);
    expect(count, 'expected the Deadline Strip to render day labels').toBeGreaterThan(0);
    expect(overflowing, `clipped labels: ${overflowing.join(', ')}`).toEqual([]);
  });
});
