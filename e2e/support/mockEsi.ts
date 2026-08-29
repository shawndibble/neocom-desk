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

    const typeMatch = /^\/universe\/types\/(\d+)$/.exec(path);
    if (typeMatch) {
      const info = UNIVERSE_TYPES[Number(typeMatch[1])];
      if (info) return json(info);
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
