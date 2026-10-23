/**
 * Signs in a Director and opens the Corp Board against mocked corp ESI.
 * `extra` answers a path first, for a spec that needs more than the defaults
 * (it returns undefined to fall through).
 *
 * `mockEsi.ts`'s own comment invites the override: "A corp spec should
 * override this route" (its `/roles` fixture answers `{}`).
 */
import type { Page } from '@playwright/test';
import { expect } from './testBase';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './fixtureData';
import { scopesForGroup } from '../../src/esi/scopes';
import { makeAccessToken } from './mockSso';

const LONG_NAME = 'Nakugard - Home Sweet Home Fortizar Citadel Deployment Alpha';
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

export async function openCorpOverview(
  page: Page,
  extra?: (path: string) => unknown
): Promise<void> {
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
    const answer = extra?.(path);
    if (answer !== undefined) return json(answer);

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
    if (path === `${corp}/structures/skyhooks`) return json({ skyhooks: [] });
    if (path === `${corp}/structures/sovereignty-hubs`) return json({ sovereignty_hubs: [] });
    if (path === '/sovereignty/systems') return json({ solar_systems: [] });
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

/** The widest elements past the viewport, for a no-horizontal-scroll check. */
export async function overflow(page: Page) {
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
