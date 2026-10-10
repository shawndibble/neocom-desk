/**
 * The corp ops board at 320px (issue #419).
 *
 * The board's row is a fixed-width countdown column (`w-full sm:w-24`) beside
 * flex-wrapping text (`min-w-0 flex-1` + `truncate`) — untested at the low
 * end before this. Rather than `productionCss.built.spec.ts`'s pattern
 * (production CSS, `/styleguide`, no ESI needed), this runs against the dev
 * server: `/corp` needs a signed-in character and mocked ESI, which that
 * spec's target deliberately avoids needing at all. The overflow assertion
 * itself is the same one that file established — `scrollWidth` must not
 * exceed `clientWidth` — reused here rather than invented fresh.
 *
 * `mockEsi.ts`'s own comment invites exactly this override: "A corp spec
 * should override this route" (the `/roles` fixture answering `{}` puts
 * every corp capability off).
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { answerRailQuestion } from './support/login';
import {
  CHARACTER_NAME,
  CHARACTER_ID,
  CORPORATION_ID,
  OWNER_HASH,
  SCOPES,
} from './support/fixtureData';
import { scopesForGroup } from '../src/esi/scopes';

const NARROW = { width: 320, height: 720 };

/** Far-future expiry, matching `mockSso.ts`'s own mocked token. */
const EXP_SECONDS = 4_102_444_800;

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * `mockSso.ts`'s own `makeAccessToken` always grants `SCOPES` — deliberately
 * excluding the `corp` opt-in group (issue #295), so the default mock can
 * never reach `useCorpAccess`'s `ready` state no matter how many roles a
 * character holds. This is that same token shape with the corp group's
 * scopes unioned in, standing in for a Character who has already been
 * through the app's own corp grant flow once before.
 */
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

const LONG_NAME = 'Nakugard - Home Sweet Home Fortizar Citadel Deployment Alpha';

/** Logs in with the corp scopes granted, mocks one structure called `name`, and opens `/corp`. */
async function openCorpBoard(page: Page, name: string, structureCount = 1): Promise<void> {
  // Registered after `installSsoMock` (the `page` fixture's own setup), so
  // Playwright tries this one first: same endpoint, a token carrying the
  // corp scope group too.
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

    // Station_Manager opens both `canReadStructures` and
    // `canReadMoonExtractions` (engine/corpRoles.ts) — the extractions
    // read fires right alongside structures, and an unmocked route here
    // would trip testBase's network guard, not just leave a panel empty.
    if (path === `/characters/${CHARACTER_ID}/roles`) {
      return json({ roles: ['Station_Manager'] });
    }
    if (path === `/corporations/${CORPORATION_ID}/structures`) {
      return json(
        Array.from({ length: structureCount }, (_, index) => ({
          structure_id: index + 1,
          corporation_id: CORPORATION_ID,
          system_id: 1,
          type_id: 1,
          profile_id: 1,
          // Deliberately long and unbroken: the regression this guards is
          // a flex child rendering without `min-w-0`, which overflows
          // instead of truncating — a short name would never surface it.
          name: index === 0 ? name : `${name} ${index + 1}`,
          fuel_expires: new Date(Date.now() + (index + 2) * 86_400_000).toISOString(),
        }))
      );
    }
    if (path === `/corporation/${CORPORATION_ID}/mining/extractions`) return json([]);

    await route.fallback();
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
  await expect(page).toHaveURL(/\/overview$/);
  await answerRailQuestion(page);

  await page.goto('./corp');
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

test.describe('corp ops board — 320px width', () => {
  test.use({ viewport: NARROW });

  test('the board holds without a horizontal scroll, and empty cards stay compact', async ({
    page,
  }) => {
    await openCorpBoard(page, LONG_NAME);

    // `scrollWidth` is never below `clientWidth`, so "not wider" is the whole
    // assertion — the same technique `productionCss.built.spec.ts` uses.
    const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
      const root = document.documentElement;
      const limit = root.clientWidth;
      const offenders = Array.from(document.body.querySelectorAll('*'))
        .map((element) => ({ element, right: element.getBoundingClientRect().right }))
        .filter((entry) => entry.right > limit + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 5)
        .map(({ element, right }) => {
          const name = element.getAttribute('aria-label') ?? element.id;
          return `${element.tagName.toLowerCase()}[class="${element.className}"]${name ? ` (${name})` : ''} @ ${Math.round(right)}px`;
        });
      return { scrollWidth: root.scrollWidth, clientWidth: limit, offenders };
    });
    expect(
      scrollWidth,
      `Page is ${scrollWidth}px wide in a ${clientWidth}px viewport. Widest: ${offenders.join(', ')}`
    ).toBeLessThanOrEqual(clientWidth);

    // Empty-and-fine cards fold into one "Nothing due" line instead of a card
    // each: shorter than the fuel card holding a single row, and the folded
    // kinds are named in it so "nothing due" stays distinguishable (#3142).
    for (const width of [390, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const box = (locator: Locator) => locator.evaluate((el) => el.getBoundingClientRect().height);
      const withRow = await box(
        page.getByRole('heading', { name: 'Fuel' }).locator('xpath=ancestor::section[1]')
      );
      const summary = page.getByText(/^Nothing due: /);
      await expect(summary).toContainText('Moon chunks');
      await expect(summary).toContainText('Structure timers');
      await expect(page.getByRole('heading', { name: 'Moon chunks' })).toHaveCount(0);
      expect(await box(summary), `summary at ${width}`).toBeLessThan(withRow);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `no overflow at ${width}`
      ).toBe(true);
    }
  });
});

test.describe('corp Kind Cards — whole structure names (#3124)', () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    test(`the name wraps instead of truncating to one line at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openCorpBoard(page, LONG_NAME);

      const fits = await page
        .getByText(LONG_NAME)
        .evaluate((element) => element.scrollWidth <= element.clientWidth);
      expect(fits, 'the name is cut off on one line instead of wrapping').toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `no overflow at ${viewport.width}`
      ).toBe(true);
    });
  }
});

for (const width of [390, 1024, 1280]) {
  test.describe(`corp kind card footer — ${width}px width`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('the Show more button fits inside its card and the page does not overflow', async ({
      page,
    }) => {
      await openCorpBoard(page, LONG_NAME, 5);

      const toggle = page.getByRole('button', { name: 'Show 2 more' });
      await expect(toggle).toBeVisible();
      const box = await toggle.boundingBox();
      // `min-h-11` is the touch tier below `md` only.
      if (width < 768) expect(box!.height).toBeGreaterThanOrEqual(44);

      const card = await toggle.evaluate((el) => {
        const r = el.closest('section')!.getBoundingClientRect();
        return { left: r.left, right: r.right, bottom: r.bottom };
      });
      expect(box!.x).toBeGreaterThanOrEqual(card.left - 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(card.right + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(card.bottom + 1);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  });
}
