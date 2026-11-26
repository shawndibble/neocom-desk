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

const PREFETCHED_EMPTY = new Set(
  [
    'assets',
    'blueprints',
    'calendar',
    'contacts',
    'contacts/labels',
    'contracts',
    'corporationhistory',
    'fittings',
    'industry/jobs',
    'mail',
    'mail/lists',
    'mining/',
    'notifications',
    'orders',
    'orders/history',
    'planets',
    'standings/',
    'wallet/journal',
    'wallet/transactions',
  ].map((suffix) => `/characters/${CHARACTER_ID}/${suffix}`)
);

const EMPTY_MAIL_LABELS = { labels: [], total_unread_count: 0 };

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
    if (path === `/characters/${CHARACTER_ID}/location`) return json({ solar_system_id: 30000142 });
    if (path === `/characters/${CHARACTER_ID}/ship`) {
      return json({ ship_item_id: 1_000_000_000_001, ship_name: 'E2E ship', ship_type_id: 24702 });
    }
    if (path === '/universe/systems/30000142') {
      return json({
        system_id: 30000142,
        name: 'Jita',
        security_status: 0.9459,
        constellation_id: 20000020,
        star_id: 40009076,
      });
    }
    if (path === `/corporations/${CORPORATION_ID}`) return json(CORPORATION_INFO);
    if (path === `/alliances/${ALLIANCE_ID}`) return json(ALLIANCE_INFO);
    if (path === '/markets/prices') return json(MARKET_PRICES);
    if (/^\/markets\/\d+\/history\/?$/.test(path)) return json([]);
    if (/^\/markets\/\d+\/types\/?$/.test(path)) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    if (path === '/incursions') return json([]);
    if (path === '/military-campaigns') return json({ campaigns: [] });
    if (/^\/military-campaigns\/[^/]+\/objectives\/?$/.test(path)) return json({ objectives: [] });
    if (path === `/characters/${CHARACTER_ID}/military-campaigns/objectives`) {
      return json({ objectives: [] });
    }
    if (path === '/skyhooks/raidable') return json({ skyhooks: [] });
    if (path === '/industry/systems') return json(INDUSTRY_SYSTEMS);

    if (path === '/characters/affiliation') {
      const ids = route.request().postDataJSON() as number[];
      return json(
        ids
          .filter((id) => id === CHARACTER_ID)
          .map((id) => ({
            character_id: id,
            corporation_id: CORPORATION_ID,
            alliance_id: ALLIANCE_ID,
          }))
      );
    }
    if (path === '/universe/ids') return json({});
    if (path === '/universe/names') {
      const ids = route.request().postDataJSON() as number[];
      return json(
        ids.map((id) => {
          if (id === CORPORATION_ID) return { id, name: CORPORATION_NAME, category: 'corporation' };
          if (id === ALLIANCE_ID) return { id, name: ALLIANCE_NAME, category: 'alliance' };
          return { id, name: `Unknown ${id}`, category: 'character' };
        })
      );
    }

    if (PREFETCHED_EMPTY.has(path)) return json([]);
    if (path === `/characters/${CHARACTER_ID}/mail/labels`) return json(EMPTY_MAIL_LABELS);
    if (path === `/characters/${CHARACTER_ID}/clones`) return json(EMPTY_CLONES);
    if (path === `/characters/${CHARACTER_ID}/structures/mercenary-dens`) {
      return json({ mercenary_dens: [] });
    }
    if (path === `/characters/${CHARACTER_ID}/mercenary-tactical-operations`) {
      return json({ operations: [] });
    }
    if (path === `/characters/${CHARACTER_ID}/roles`) return json({});

    if (path === `/characters/${CHARACTER_ID}/loyalty/points`) return json([]);
    if (/^\/loyalty\/stores\/\d+\/offers\/$/.test(path)) return json([]);
    if (path === '/universe/factions') return json([]);

    const stationMatch = /^\/universe\/stations\/(\d+)$/.exec(path);
    if (stationMatch) {
      return json({
        station_id: Number(stationMatch[1]),
        name: `Station ${stationMatch[1]}`,
        type_id: 52678,
        system_id: 30000142,
        owner: CORPORATION_ID,
      });
    }

    const typeMatch = /^\/universe\/types\/(\d+)$/.exec(path);
    if (typeMatch) {
      const info = UNIVERSE_TYPES[Number(typeMatch[1])];
      if (info) return json(info);
    }

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

    if (/^\/markets\/\d+\/orders\/?$/.test(path)) return json([]);

    const regionMatch = /^\/universe\/regions\/(\d+)$/.exec(path);
    if (regionMatch) {
      const regionId = Number(regionMatch[1]);
      return json({
        region_id: regionId,
        name: `Region ${regionId}`,
        description: '',
        constellations: [],
      });
    }

    const calendarEventMatch = /^\/characters\/\d+\/calendar\/(\d+)$/.exec(path);
    if (calendarEventMatch) {
      const eventId = Number(calendarEventMatch[1]);
      return json({
        event_id: eventId,
        title: `Event ${eventId}`,
        date: '2099-01-01T18:00:00Z',
        duration: 60,
        importance: 0,
        owner_id: CORPORATION_ID,
        owner_name: CORPORATION_NAME,
        owner_type: 'corporation',
        response: 'not_responded',
        text: 'Fixture event.',
      });
    }
    const mailBodyMatch = /^\/characters\/\d+\/mail\/(\d+)$/.exec(path);
    if (mailBodyMatch) {
      return json({
        from: CHARACTER_ID,
        subject: `Mail ${mailBodyMatch[1]}`,
        timestamp: '2026-01-01T12:00:00Z',
        body: 'Fixture mail body.',
        read: false,
        labels: [1],
        recipients: [{ recipient_id: CHARACTER_ID, recipient_type: 'character' }],
      });
    }

    await route.fallback();
  });

  await page.route('https://zkillboard.com/api/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: '[]',
    });
  });

  await page.route('https://api.eve-scout.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: '[]',
    });
  });

  await page.route('https://data.neocomdesk.com/**', async (route) => {
    await route.fulfill({
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: '',
    });
  });

  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FUZZWORK_AGGREGATES),
    });
  });

  await page.route('https://images.evetech.net/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: TINY_SVG,
    });
  });
}
