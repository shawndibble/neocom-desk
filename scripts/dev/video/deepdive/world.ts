/**
 * The deep-dive world: a lived-in three-character account for the product videos. Every capture
 * spec calls `openWorld(page, path, options)` instead of the promo's `openSandbox`.
 *
 * It layers, in order (later routes win): the e2e fake SSO and ESI, the sandbox's generated data
 * for Arden (mail, contracts, calendar, corp), then this world's own answers for all three
 * characters (skills, wallet, orders, assets, ...), the shared price model (Fuzzwork, Open Prices,
 * region order books, history) and the capture spec's own `before` installers. See README.md.
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installEsiMock } from '../../../../e2e/support/mockEsi';
import { installSsoMock } from '../../../../e2e/support/mockSso';
import { overviewLayoutSetting, type SeededWidget } from '../../../../e2e/support/authSeed';
import { SCOPES } from '../../../../e2e/support/fixtureData';
import { SCOPE_GROUPS } from '../../../../src/esi/registry';
import { scopesForGroup } from '../../../../src/esi/scopes';
import { TRADE_HUBS } from '../../../../src/market/hubs';
import { DAY_MS, HOUR_MS } from '../../../../src/lib/age';
import { utcDay } from '../../../../src/engine/localDay';
import { roundIsk } from '../../../../src/lib/isk';
import { installPersonalEsi } from '../../sandbox/personalEsi';
import * as social from '../../sandbox/socialEsi';
import { mix } from '../../sandbox/gen';
import {
  ALLIANCE,
  ARDEN,
  CAST,
  CAST_IDS,
  CORPORATION,
  MIRA,
  NPC,
  STATIONS,
  SYSTEMS,
  TOBIN,
  type CastMember,
} from './cast';
import { characterAssets, assetNames } from './assets';
import { basePrice, BASE_PRICE, typeGroup, typeName } from './catalog';
import { blueprints, industryJobs, mining } from './industry';
import { OWN_ORDERS, aggregate, bookAt, history, ownPrice, regionBook } from './market';
import { seedWorldAndGoto } from './seed';
import { characterAttributes, characterSkillQueue, characterSkills } from './skills';
import { BALANCES, walletBooks } from './wallet';
import { portraitSvg } from './portraits';

const data = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`../../../../public/data/${file}`, import.meta.url), 'utf8'));
const SYSTEM_ROWS = new Map(
  data<{ id: number; name: string; security: number; regionId: number }[]>('market/systems.json').map(
    (row) => [row.id, row]
  )
);
const STATION_ROWS = new Map(
  data<{ id: number; name: string; systemId: number; typeId: number; ownerCorporationId: number }[]>(
    'market/stations.json'
  ).map((row) => [row.id, row])
);
const TYPE_ROWS = data<Record<string, { name: string; groupID: number }>>('types.json');
const REGION_ROWS = new Map(
  data<{ id: number; name: string }[]>('market/regions.json').map((row) => [row.id, row])
);

export interface WorldOptions {
  /** Active character: a cast member, 'arden' | 'mira' | 'tobin', or an id. Default Arden. */
  active?: CastMember | 'arden' | 'mira' | 'tobin' | number;
  /** The active character's current system (id). Default Nourvukaiken (Lonetrek, 0.82). */
  systemId?: number;
  /** The station the active character is docked in. Default: the home station when the system is Nourvukaiken, none (in space) otherwise. */
  stationId?: number | null;
  /** The Overview layout to seed. Default: a trader's board. Pass false for the first-run role chooser. */
  overview?: readonly SeededWidget[] | false;
  /** More `settings` rows to seed. */
  settings?: readonly { key: string; value: unknown }[];
  /** Extra route installers, run after the world's own so they win. */
  before?: (page: Page) => Promise<void>;
  /** Load every character's data into the local cache first (Characters > Refresh all), so pages that read the roster from cache show all three. Default true; costs a few seconds. */
  warm?: boolean;
  /** Replace the SSO scopes (default: every scope the app can ask for). */
  scopes?: readonly string[];
}

export const DEFAULT_OVERVIEW: readonly SeededWidget[] = [
  { kind: 'training', size: 'M' },
  { kind: 'wallet', size: 'M' },
  { kind: 'orders', size: 'M' },
  { kind: 'netWorth', size: 'M' },
  { kind: 'location', size: 'S' },
  { kind: 'industry', size: 'M' },
  { kind: 'comingUp', size: 'M' },
  { kind: 'mail', size: 'M' },
];

function resolveActive(active: WorldOptions['active']): CastMember {
  if (active === undefined || active === 'arden') return ARDEN;
  if (active === 'mira') return MIRA;
  if (active === 'tobin') return TOBIN;
  if (typeof active === 'number') return CAST.find((member) => member.id === active) ?? ARDEN;
  return active;
}

/** Homes: where each character sits by default. */
const HOME: Record<number, { systemId: number; stationId: number }> = {
  [ARDEN.id]: { systemId: SYSTEMS.nourvukaiken, stationId: STATIONS.nourvukaiken },
  [MIRA.id]: { systemId: SYSTEMS.tunttaras, stationId: STATIONS.tunttaras },
  [TOBIN.id]: { systemId: SYSTEMS.jita, stationId: STATIONS.jita },
};

const IMPLANTS: Record<number, number[]> = {
  [ARDEN.id]: [10217, 10213],
  [MIRA.id]: [10209, 10222],
  [TOBIN.id]: [9942, 9899],
};
const JUMP_CLONES: Record<number, { station: number; implants: number[] }[]> = {
  [ARDEN.id]: [{ station: STATIONS.jita, implants: [10209, 10222] }],
  [MIRA.id]: [],
  [TOBIN.id]: [{ station: STATIONS.rens, implants: [9956] }],
};

const BIRTHDAY: Record<number, { date: string; race: number; bloodline: number; gender: 'male' | 'female'; security: number }> = {
  [ARDEN.id]: { date: '2019-03-14T09:12:00Z', race: 1, bloodline: 1, gender: 'male', security: 3.2 },
  [MIRA.id]: { date: '2020-07-02T17:40:00Z', race: 8, bloodline: 7, gender: 'female', security: 0.4 },
  [TOBIN.id]: { date: '2021-01-19T11:05:00Z', race: 2, bloodline: 4, gender: 'male', security: 1.1 },
};

const NPC_NAMES = new Map<number, string>([
  [NPC.concord.id, NPC.concord.name],
  [NPC.scc.id, NPC.scc.name],
  [NPC.caldariNavy.id, NPC.caldariNavy.name],
]);

function entityName(id: number): { name: string; category: string } {
  const cast = CAST.find((member) => member.id === id);
  if (cast) return { name: cast.name, category: 'character' };
  if (id === CORPORATION.id) return { name: CORPORATION.name, category: 'corporation' };
  if (id === ALLIANCE.id) return { name: ALLIANCE.name, category: 'alliance' };
  const npc = NPC_NAMES.get(id);
  if (npc) return { name: npc, category: 'corporation' };
  const station = STATION_ROWS.get(id);
  if (station) return { name: station.name, category: 'station' };
  const system = SYSTEM_ROWS.get(id);
  if (system) return { name: system.name, category: 'solar_system' };
  const region = REGION_ROWS.get(id);
  if (region) return { name: region.name, category: 'region' };
  const social_ = social.nameFor(id);
  if (social_) return social_;
  const type = TYPE_ROWS[String(id)];
  if (type && id < 200_000) return { name: type.name, category: 'inventory_type' };
  return { name: `Unknown ${id}`, category: 'character' };
}

const ACAO = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-pages' };
const jsonResponse = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  headers: { ...ACAO, 'x-pages': '1' },
  body: JSON.stringify(body),
});

/** Shapes an unhandled alt-character path answers with: lists by default, objects where ESI sends one. */
function altDefault(rest: string): unknown {
  if (rest === 'mail/labels') return { labels: [], total_unread_count: 0 };
  if (rest === 'roles') return {};
  if (rest === 'fatigue') return {};
  if (rest === 'structures/mercenary-dens') return { mercenary_dens: [] };
  if (rest === 'mercenary-tactical-operations') return { operations: [] };
  if (rest === 'military-campaigns/objectives') return { objectives: [] };
  return [];
}

function characterAnswer(member: CastMember, rest: string, method: string, body: unknown, options: Required<Pick<WorldOptions, 'systemId'>> & { stationId: number | null; active: boolean }): unknown {
  const books = () => walletBooks(member.id);
  const orders = OWN_ORDERS.filter((spec) => spec.owner === member.id).map((spec) => ({
    order_id: spec.id,
    type_id: spec.typeId,
    region_id: regionOf(spec.station),
    location_id: spec.station,
    is_buy_order: spec.buy ?? false,
    is_corporation: false,
    price: ownPrice(spec),
    volume_total: spec.total,
    volume_remain: spec.remain,
    min_volume: 1,
    issued: new Date(Date.now() - spec.ageHours * HOUR_MS).toISOString(),
    duration: spec.duration ?? 90,
    range: spec.buy ? 'station' : 'region',
    ...(spec.buy ? { escrow: roundIsk(ownPrice(spec) * spec.remain) } : {}),
  }));
  switch (rest) {
    case '':
      return publicInfo(member);
    case 'skills':
      return characterSkills(member.id);
    case 'skillqueue':
      return characterSkillQueue(member.id);
    case 'attributes':
      return characterAttributes(member.id);
    case 'implants':
      return IMPLANTS[member.id];
    case 'wallet':
      return BALANCES[member.id];
    case 'wallet/journal':
      return books().journal;
    case 'wallet/transactions':
      return books().transactions;
    case 'orders':
      return orders;
    case 'orders/history':
      return orderHistory(member.id);
    case 'assets':
      return characterAssets(member.id);
    case 'assets/names':
      return method === 'POST' ? assetNames(body as number[]) : [];
    case 'location': {
      return options.stationId === null
        ? { solar_system_id: options.systemId }
        : { solar_system_id: options.systemId, station_id: options.stationId };
    }
    case 'ship': {
      const ship = characterAssets(member.id).find((row) => row.is_singleton);
      return { ship_item_id: ship?.item_id ?? 1, ship_name: shipName(ship?.item_id), ship_type_id: ship?.type_id ?? 17715 };
    }
    case 'online':
      return { online: options.active, last_login: new Date(Date.now() - 3 * HOUR_MS).toISOString(), last_logout: new Date(Date.now() - 9 * HOUR_MS).toISOString(), logins: 1402 + member.id % 50 };
    case 'clones':
      return {
        home_location: { location_id: HOME[member.id].stationId, location_type: 'station' },
        jump_clones: JUMP_CLONES[member.id].map((clone, index) => ({
          jump_clone_id: 70_000 + member.id % 1000 * 10 + index,
          location_id: clone.station,
          location_type: 'station',
          implants: clone.implants,
        })),
        last_clone_jump_date: new Date(Date.now() - 19 * DAY_MS).toISOString(),
        last_station_change_date: new Date(Date.now() - 140 * DAY_MS).toISOString(),
      };
    case 'industry/jobs':
      return industryJobs(member.id);
    case 'blueprints':
      return blueprints(member.id);
    case 'mining/':
    case 'mining':
      return mining(member.id);
    case 'corporationhistory':
      return [
        { corporation_id: CORPORATION.id, record_id: 3, start_date: new Date(Date.now() - 380 * DAY_MS).toISOString() },
        { corporation_id: 1_000_009, record_id: 2, start_date: new Date(Date.now() - 900 * DAY_MS).toISOString() },
      ];
    default:
      return undefined;
  }
}

function shipName(itemId: number | undefined): string {
  const named = itemId === undefined ? [] : assetNames([itemId]);
  return named[0]?.name ?? 'Ship';
}

function regionOf(stationId: number): number {
  const system = SYSTEM_ROWS.get(STATION_ROWS.get(stationId)?.systemId ?? 0);
  return system?.regionId ?? 10000002;
}

/** A handful of finished orders per character, for the order history tab. */
function orderHistory(characterId: number) {
  return OWN_ORDERS.filter((spec) => spec.owner === characterId && !spec.buy)
    .slice(0, 4)
    .map((spec, index) => ({
      order_id: spec.id - 500 - index,
      type_id: spec.typeId,
      region_id: regionOf(spec.station),
      location_id: spec.station,
      is_buy_order: false,
      is_corporation: false,
      price: ownPrice(spec),
      volume_total: spec.total,
      volume_remain: 0,
      min_volume: 1,
      issued: new Date(Date.now() - (40 + index * 6) * DAY_MS).toISOString(),
      duration: 90,
      range: 'region',
      state: index % 2 === 0 ? 'expired' : 'cancelled',
    }));
}

function publicInfo(member: CastMember) {
  const info = BIRTHDAY[member.id];
  return {
    name: member.name,
    corporation_id: CORPORATION.id,
    alliance_id: ALLIANCE.id,
    birthday: info.date,
    bloodline_id: info.bloodline,
    gender: info.gender,
    race_id: info.race,
    security_status: info.security,
  };
}

const CORPORATION_INFO = {
  name: CORPORATION.name,
  ticker: CORPORATION.ticker,
  ceo_id: 91_000_000,
  creator_id: 91_000_000,
  member_count: 38,
  tax_rate: 0.08,
  alliance_id: ALLIANCE.id,
  home_station_id: STATIONS.nourvukaiken,
  date_founded: '2021-04-17T19:30:00Z',
  description: 'Mining, manufacturing and missile logistics out of Lonetrek.',
  url: '',
};
const ALLIANCE_INFO = {
  name: ALLIANCE.name,
  ticker: ALLIANCE.ticker,
  creator_corporation_id: CORPORATION.id,
  creator_id: 91_000_000,
  date_founded: '2020-11-02T20:00:00Z',
  executor_corporation_id: CORPORATION.id,
};

async function installWorldEsi(page: Page, active: CastMember, systemId: number, stationId: number | null) {
  await page.route('https://esi.evetech.net/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/(latest|dev|v\d+)\//, '/');
    const method = request.method();
    const body = method === 'POST' ? safeJson(request.postData()) : null;
    const json = (value: unknown) => route.fulfill(jsonResponse(value));

    if (path === '/universe/names' && method === 'POST') {
      return json((body as number[]).map((id) => ({ id, ...entityName(id) })));
    }
    if (path === '/characters/affiliation' && method === 'POST') {
      return json(
        (body as number[]).map((id) => {
          if (id >= 90_000_000 && id < 91_000_000) {
            return { character_id: id, corporation_id: CORPORATION.id, alliance_id: ALLIANCE.id };
          }
          return { character_id: id, corporation_id: 92_000_000 + (id % 4) };
        })
      );
    }
    if (path === `/corporations/${CORPORATION.id}`) return json(CORPORATION_INFO);
    if (path === `/alliances/${ALLIANCE.id}`) return json(ALLIANCE_INFO);
    const corpMatch = /^\/corporations\/(92\d{6})$/.exec(path);
    if (corpMatch) {
      const name = entityName(Number(corpMatch[1])).name;
      return json({ name, ticker: name.replace(/[^A-Z]/g, '').slice(0, 4) || 'CORP', ceo_id: 91_000_001, creator_id: 91_000_001, member_count: 12, tax_rate: 0.1 });
    }
    const systemMatch = /^\/universe\/systems\/(\d+)$/.exec(path);
    if (systemMatch && SYSTEM_ROWS.has(Number(systemMatch[1]))) {
      const row = SYSTEM_ROWS.get(Number(systemMatch[1]))!;
      return json({ system_id: row.id, name: row.name, security_status: row.security, constellation_id: 20000020 + (row.regionId % 100), star_id: 40000000 + (row.id % 1000) });
    }
    const stationMatch = /^\/universe\/stations\/(\d+)$/.exec(path);
    if (stationMatch && STATION_ROWS.has(Number(stationMatch[1]))) {
      const row = STATION_ROWS.get(Number(stationMatch[1]))!;
      return json({ station_id: row.id, name: row.name, type_id: row.typeId, system_id: row.systemId, owner: row.ownerCorporationId });
    }
    const typeMatch = /^\/universe\/types\/(\d+)$/.exec(path);
    if (typeMatch && TYPE_ROWS[typeMatch[1]]) {
      const id = Number(typeMatch[1]);
      return json({ type_id: id, name: typeName(id), description: '', group_id: typeGroup(id), published: true });
    }
    const regionMatch = /^\/universe\/regions\/(\d+)$/.exec(path);
    if (regionMatch && REGION_ROWS.has(Number(regionMatch[1]))) {
      const id = Number(regionMatch[1]);
      return json({ region_id: id, name: REGION_ROWS.get(id)!.name, description: '', constellations: [] });
    }
    if (path === '/markets/prices') {
      return json(
        Object.keys(BASE_PRICE).map((id) => ({ type_id: Number(id), average_price: basePrice(Number(id)), adjusted_price: basePrice(Number(id)) * 0.97 }))
      );
    }
    const ordersMatch = /^\/markets\/(\d+)\/orders\/?$/.exec(path);
    if (ordersMatch) {
      const typeId = Number(url.searchParams.get('type_id'));
      if (!typeId) return json([]);
      const side = url.searchParams.get('order_type') ?? 'all';
      return json(
        regionBook(Number(ordersMatch[1]), typeId)
          .filter((order) => side === 'all' || (side === 'buy') === order.is_buy_order)
      );
    }
    const historyMatch = /^\/markets\/(\d+)\/history\/?$/.exec(path);
    if (historyMatch) return json(history(Number(historyMatch[1]), Number(url.searchParams.get('type_id'))));

    const characterMatch = /^\/characters\/(\d+)(?:\/(.*))?$/.exec(path);
    if (characterMatch) {
      const id = Number(characterMatch[1]);
      const member = CAST.find((entry) => entry.id === id);
      if (member) {
        const here = id === active.id ? { systemId, stationId } : { systemId: HOME[id].systemId, stationId: HOME[id].stationId as number | null };
        const raw = characterMatch[2] ?? '';
        const rest = raw === 'mining/' ? raw : raw.replace(/\/$/, '');
        const answer = characterAnswer(member, rest, method, body, { ...here, active: id === active.id });
        if (answer !== undefined) return json(answer);
        if (id === ARDEN.id) {
          // Mail, contracts, calendar, contacts: the sandbox's generated data. The calendar's
          // owner is patched below, so it names the corporation, not the e2e fixture's.
          const event = /^calendar\/(\d+)$/.exec(characterMatch[2] ?? '');
          if (event) return json({ ...social.calendarEvent(Number(event[1])), owner_name: CORPORATION.name });
          return route.fallback();
        }
        return json(altDefault(rest));
      }
    }
    return route.fallback();
  });
}

function safeJson(text: string | null): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Fuzzwork aggregates and Open Prices, both read from the world's books. */
async function installWorldPrices(page: Page) {
  await page.route('https://market.fuzzwork.co.uk/**', async (route) => {
    const url = new URL(route.request().url());
    const types = (url.searchParams.get('types') ?? '').split(',').map(Number).filter(Boolean);
    const station = Number(url.searchParams.get('station'));
    const region = Number(url.searchParams.get('region'));
    const out: Record<string, unknown> = {};
    for (const typeId of types) {
      out[String(typeId)] = station ? aggregate(bookAt(station, typeId)) : aggregate(regionBook(region, typeId));
    }
    await route.fulfill(jsonResponse(out));
  });
  const hubStations = TRADE_HUBS.map((hub) => hub.stationId);
  await page.route('https://data.neocomdesk.com/open-prices/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/open-prices/shards/')) {
      return route.fulfill({ status: 200, headers: ACAO, contentType: 'application/json', body: '{"types":{}}' });
    }
    const typeId = Number(/\/open-prices\/(\d+)\.json$/.exec(path)?.[1]);
    if (!Number.isInteger(typeId)) return route.fallback();
    const dates = Array.from({ length: 30 }, (_, d) => utcDay(Date.now() - (30 - d) * DAY_MS));
    const stations = Object.fromEntries(
      hubStations.map((stationId) => {
        const sell = dates.map((_, d) => Math.round(bookAt(stationId, typeId).filter((o) => !o.is_buy_order).reduce((min, o) => Math.min(min, o.price), Infinity) * (1 + (mix(typeId + d * 13) - 500) / 8_000) * 100) / 100);
        return [String(stationId), { sell, buy: sell.map((price) => Math.round(price * 0.93 * 100) / 100) }];
      })
    );
    await route.fulfill({ status: 200, headers: ACAO, contentType: 'application/json', body: JSON.stringify({ dates, stations }) });
  });
}

/** Portraits and logos for the invented names; real renders and icons still come from the image server. */
async function installWorldImages(page: Page) {
  await page.route('https://images.evetech.net/**', async (route) => {
    const match = /^\/(characters|corporations|alliances)\/(\d+)\//.exec(new URL(route.request().url()).pathname);
    if (!match) return route.continue();
    const id = Number(match[2]);
    const name = entityName(id);
    if (name.name.startsWith('Unknown') || (match[1] === 'characters' && !CAST_IDS.includes(id))) return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: ACAO,
      body: portraitSvg(name.name, match[1] as 'characters' | 'corporations' | 'alliances', id),
    });
  });
}

export async function openWorld(page: Page, path: string, options: WorldOptions = {}): Promise<void> {
  const active = resolveActive(options.active);
  const home = HOME[active.id];
  const systemId = options.systemId ?? home.systemId;
  const stationId =
    options.stationId !== undefined
      ? options.stationId
      : options.systemId === undefined || options.systemId === home.systemId
        ? home.stationId
        : null;
  const scopes =
    options.scopes ?? [...new Set([...SCOPES, ...SCOPE_GROUPS.flatMap((group) => scopesForGroup(group))])];

  await installSsoMock(page, scopes);
  await installEsiMock(page);
  await installPersonalEsi(page);
  await installWorldImages(page);
  await installWorldPrices(page);
  await installWorldEsi(page, active, systemId, stationId);
  await options.before?.(page);

  const overview = options.overview === undefined ? DEFAULT_OVERVIEW : options.overview;
  await seedWorldAndGoto(page, path, {
    activeId: active.id,
    scopes,
    settings: [...(overview === false ? [] : [overviewLayoutSetting(overview)]), ...(options.settings ?? [])],
  });
  if (options.warm !== false) await warmRoster(page, path);
}

/** Fills the cache for all three characters via Characters > Refresh all, then returns to `path`. */
export async function warmRoster(page: Page, path: string): Promise<void> {
  if (!/\/characters/.test(path)) await page.goto('./characters');
  await page.getByRole('button', { name: /refresh all/i }).first().click();
  await page.getByText('Not read').first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
  if (!/\/characters/.test(path)) await page.goto(path);
}
