/**
 * The Corp Board's widget grid across widths.
 *
 * `/corp` needs a signed-in character with corp roles and mocked corp ESI, so
 * this runs against the dev server like the other corp specs. A Director opens
 * every corp capability, so every default widget draws; long structure names
 * are deliberate, since the regression this guards is a widget that overflows
 * instead of truncating or wrapping.
 *
 * `mockEsi.ts`'s own comment invites the override: "A corp spec should
 * override this route" (its `/roles` fixture answers `{}`).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
import { scopesForGroup } from '../src/esi/scopes';
import { makeAccessToken } from './support/mockSso';

const LONG_NAME = 'Nakugard - Home Sweet Home Fortizar Citadel Deployment Alpha';
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function openCorpOverview(page: Page): Promise<void> {
  await page.route('https://login.eveonline.com/v2/oauth/token', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: makeAccessToken([...SCOPES, ...scopesForGroup('corp')]),
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
    const corp = `/corporations/${CORPORATION_ID}`;

    if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Director'] });
    if (path === `${corp}/structures`) {
      return json(
        [0, 1, 2].map((index) => ({
          structure_id: index + 1,
          corporation_id: CORPORATION_ID,
          system_id: 1,
          type_id: 1,
          profile_id: 1,
          name: index === 0 ? LONG_NAME : `${LONG_NAME} ${index + 1}`,
          fuel_expires: iso((index * 6 + 2) * DAY),
          services:
            index === 1
              ? [
                  { name: 'Manufacturing (Standard)', state: 'offline' },
                  { name: 'Reprocessing', state: 'online' },
                ]
              : [],
        }))
      );
    }
    if (path === `/corporation/${CORPORATION_ID}/mining/extractions`) {
      return json([
        {
          structure_id: 1,
          moon_id: 40000001,
          extraction_start_time: iso(-3 * DAY),
          chunk_arrival_time: iso(2 * DAY),
          natural_decay_time: iso(2 * DAY + 3 * 3_600_000),
        },
      ]);
    }
    if (path === `/corporation/${CORPORATION_ID}/mining/observers`) return json([]);
    if (path === `${corp}/wallets`) {
      return json([
        { division: 1, balance: 12_400_000_000 },
        { division: 2, balance: 3_100_000_000 },
        { division: 3, balance: 250_000_000 },
      ]);
    }
    if (path === `${corp}/divisions`) {
      return json({
        wallet: [
          { division: 1, name: 'Master Wallet' },
          { division: 2, name: 'Structure Fuel and Upkeep Reserve' },
        ],
        hangar: [],
      });
    }
    if (path === `${corp}/wallets/1/journal`) {
      return json(
        Array.from({ length: 20 }, (_, i) => ({
          id: i + 1,
          date: iso(-i * DAY),
          ref_type: i % 3 === 0 ? 'market_escrow' : 'bounty_prizes',
          description: 'x',
          amount: i % 3 === 0 ? -150_000_000 : 220_000_000,
          balance: 12_400_000_000,
        }))
      );
    }
    if (path === `${corp}/industry/jobs`) {
      return json([
        {
          job_id: 1,
          installer_id: CHARACTER_ID,
          activity_id: 1,
          blueprint_id: 1,
          blueprint_type_id: 1,
          blueprint_location_id: 1,
          output_location_id: 1,
          facility_id: 1,
          location_id: 1,
          runs: 10,
          start_date: iso(-DAY),
          end_date: iso(DAY),
          status: 'active',
          product_type_id: 1,
        },
      ]);
    }
    if (path === `${corp}/starbases`) return json([]);
    if (path === `${corp}/members`) return json([CHARACTER_ID, 90000002, 90000003]);
    if (path === `${corp}/membertracking`) {
      return json([
        {
          character_id: CHARACTER_ID,
          logon_date: iso(-DAY),
          logoff_date: iso(-DAY),
          start_date: iso(-400 * DAY),
        },
        {
          character_id: 90000002,
          logon_date: iso(-90 * DAY),
          logoff_date: iso(-90 * DAY),
          start_date: iso(-200 * DAY),
        },
        { character_id: 90000003, start_date: iso(-20 * DAY) },
      ]);
    }
    await route.fallback();
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto('./corp');
  await expect(page.getByRole('region', { name: 'Corp wallet' })).toBeVisible();
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const offenders = Array.from(document.body.querySelectorAll('*'))
      .map((element) => ({ element, right: element.getBoundingClientRect().right }))
      .filter((entry) => entry.right > limit + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5)
      .map(
        ({ element, right }) =>
          `${element.tagName.toLowerCase()}.${element.className} @ ${Math.round(right)}px`
      );
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: limit, offenders };
  });
}

test.describe('Corp Board widget grid', () => {
  test('draws the default widgets with no horizontal scroll from 320px to 1920px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openCorpOverview(page);
    for (const name of [
      'Due soon',
      'Structures',
      'Moon extractions',
      'Corp industry jobs',
      'Offline services',
      'Corp wallet',
      'Cash flow',
      'Members',
      'Inactive members',
      'Income by source',
    ]) {
      await expect(page.getByRole('region', { name, exact: true }), name).toBeVisible();
    }
    for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const { scrollWidth, clientWidth, offenders } = await overflow(page);
      expect(
        scrollWidth,
        `${width}px: page is ${scrollWidth}px wide in ${clientWidth}px. Widest: ${offenders.join(', ')}`
      ).toBeLessThanOrEqual(clientWidth);
    }
  });

  test('customizes: the Gallery offers corp widgets only', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openCorpOverview(page);
    await page.locator('#route-outlet').getByRole('button', { name: 'Customize' }).click();
    await page.getByRole('button', { name: 'Add widget' }).click();
    const gallery = page.getByRole('dialog', { name: 'Add a widget' });
    await expect(gallery.getByText('Moon mining ledger')).toBeVisible();
    await expect(gallery.getByText('Training', { exact: true })).toHaveCount(0);
  });
});
