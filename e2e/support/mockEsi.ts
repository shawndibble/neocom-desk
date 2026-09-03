/**
 * Mocks every ESI / market / image endpoint NeoCom Desk touches: no real
 * request ever reaches esi.evetech.net, market.fuzzwork.co.uk or
 * images.evetech.net. Endpoints not yet consumed by the UI (markets/prices,
 * industry/systems, fuzzwork aggregates) are mocked anyway so a future
 * caller never falls through to the network guard mid-run.
 */
import type { Page } from '@playwright/test';
import {
  ALLIANCE_ID,
  ALLIANCE_NAME,
  CHARACTER_ATTRIBUTES,
  CHARACTER_ID,
  CHARACTER_NAME,
  CHARACTER_SKILLS,
  CORPORATION_ID,
  CORPORATION_NAME,
  IMPLANT_DESCRIPTIONS,
  IMPLANT_IDS,
  IMPLANT_NAMES,
  WALLET_BALANCE,
} from './fixtureData';

const PUBLIC_INFO = {
  name: CHARACTER_NAME,
  corporation_id: CORPORATION_ID,
  birthday: '2020-01-01T00:00:00Z',
  bloodline_id: 1,
  gender: 'male' as const,
  race_id: 1,
  alliance_id: ALLIANCE_ID,
  security_status: 0.5,
};

const CORPORATION_INFO = {
  name: CORPORATION_NAME,
  ticker: 'TEST',
  ceo_id: CHARACTER_ID,
  creator_id: CHARACTER_ID,
  member_count: 1,
  tax_rate: 0.1,
  alliance_id: ALLIANCE_ID,
};

const ALLIANCE_INFO = {
  name: ALLIANCE_NAME,
  ticker: 'TESTA',
  creator_corporation_id: CORPORATION_ID,
  creator_id: CHARACTER_ID,
  date_founded: '2019-01-01T00:00:00Z',
};

const SKILL_QUEUE: unknown[] = [];

const UNIVERSE_TYPES: Record<number, unknown> = Object.fromEntries(
  IMPLANT_IDS.map((typeId) => [
    typeId,
    {
      type_id: typeId,
      name: IMPLANT_NAMES[typeId],
      description: IMPLANT_DESCRIPTIONS[typeId],
      group_id: 300,
      published: true,
    },
  ])
);

const MARKET_PRICES = [{ type_id: 34, average_price: 5.5, adjusted_price: 5.2 }];
const INDUSTRY_SYSTEMS = [
  {
    solar_system_id: 30000142,
    cost_indices: [{ activity: 'manufacturing', cost_index: 0.02 }],
  },
];
const FUZZWORK_AGGREGATES = {
  34: {
    buy: { max: 5.4, volume: 100000 },
    sell: { min: 5.6, volume: 100000 },
  },
};

/** Character endpoints the boot prefetch reads that every spec is happy to see empty. */
const PREFETCHED_EMPTY = new Set(
  [
    'assets',
    'blueprints',
    'calendar',
    'contacts',
    'contracts',
    'industry/jobs',
    'mail',
    'orders',
    'orders/history',
    'planets',
    'wallet/journal',
    'wallet/transactions',
  ].map((suffix) => `/characters/${CHARACTER_ID}/${suffix}`)
);

/** `/mail/labels` answers an object, not a list. */
const EMPTY_MAIL_LABELS = { labels: [], total_unread_count: 0 };

/** `/clones` likewise. `home_location` is optional in ESI's schema, so it is omitted rather than nulled. */
const EMPTY_CLONES = { jump_clones: [] };

const TINY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>';

export async function installEsiMock(page: Page): Promise<void> {
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (path === `/characters/${CHARACTER_ID}`) return json(PUBLIC_INFO);
    if (path === `/characters/${CHARACTER_ID}/skills`) return json(CHARACTER_SKILLS);
    if (path === `/characters/${CHARACTER_ID}/skillqueue`) return json(SKILL_QUEUE);
    if (path === `/characters/${CHARACTER_ID}/attributes`) return json(CHARACTER_ATTRIBUTES);
    if (path === `/characters/${CHARACTER_ID}/implants`) return json(IMPLANT_IDS);
    if (path === `/characters/${CHARACTER_ID}/wallet`) return json(WALLET_BALANCE);
    if (path === `/corporations/${CORPORATION_ID}`) return json(CORPORATION_INFO);
    if (path === `/alliances/${ALLIANCE_ID}`) return json(ALLIANCE_INFO);
    if (path === '/markets/prices') return json(MARKET_PRICES);
    if (path === '/industry/systems') return json(INDUSTRY_SYSTEMS);

    // Warmed at boot by `app/prefetch.ts` for every scope the mocked JWT
    // grants — which is all of them. No spec asserts on these surfaces yet, so
    // they answer empty; a spec that needs real rows should override this
    // route rather than filling the fixture in for everyone.
    if (PREFETCHED_EMPTY.has(path)) return json([]);
    if (path === `/characters/${CHARACTER_ID}/mail/labels`) return json(EMPTY_MAIL_LABELS);
    if (path === `/characters/${CHARACTER_ID}/clones`) return json(EMPTY_CLONES);

    const typeMatch = /^\/universe\/types\/(\d+)$/.exec(path);
    if (typeMatch) {
      const info = UNIVERSE_TYPES[Number(typeMatch[1])];
      if (info) return json(info);
    }

    // Item Detail resolves a dogma attribute that names a Group by id
    // (features/market/groupNames.ts). No fixture carries such an attribute
    // today, but one gaining `dogma_attributes` shouldn't fail the run on the
    // network guard.
    const groupMatch = /^\/universe\/groups\/(\d+)$/.exec(path);
    if (groupMatch) {
      const groupId = Number(groupMatch[1]);
      return json({
        group_id: groupId,
        name: `Group ${groupId}`,
        category_id: 7,
        published: true,
        types: [],
      });
    }

    // Unknown ESI path: fall through to the network guard so it shows up as
    // an explicit "unmocked request" failure rather than a silent 404.
    await route.fallback();
  });

  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FUZZWORK_AGGREGATES),
    });
  });

  await page.route('https://images.evetech.net/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TINY_SVG });
  });
}
