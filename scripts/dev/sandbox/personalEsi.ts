import type { Page } from '@playwright/test';
import { CHARACTER_ID } from '../../../e2e/support/fixtureData';
import { DAY_MS, HOUR_MS } from '../../../src/lib/age';
import { utcDay } from '../../../src/engine/localDay';
import * as social from './socialEsi';
import { iso, mix, STATION_NAMES } from './gen';
import { corpAnswer } from './corpEsi';

const day = (back: number) => utcDay(Date.now() - back * DAY_MS);

export const JITA = {
  systemId: 30000142,
  stationId: 60003760,
  name: STATION_NAMES[60003760],
  system: 'Jita',
};
export const AMARR = {
  systemId: 30002187,
  stationId: 60008494,
  name: STATION_NAMES[60008494],
  system: 'Amarr',
};
const SYSTEM_NAMES: Record<number, string> = {
  30000142: 'Jita',
  30002187: 'Amarr',
  30002053: 'Hek',
  30000144: 'Perimeter',
};
const STATIONS = [JITA, AMARR];

const MINERALS = [34, 35, 36, 37, 38, 40];
const ORES = [1230, 1228, 1224];
const MOON_ORES = [45490, 45491, 45492];
const SHIPS = [587, 24698, 638, 16240, 22544, 17476, 28606];
const MODULES = [2048, 3841, 12058, 21896];
const BLUEPRINTS: [number, number][] = [
  [24699, 24698],
  [691, 587],
  [22545, 22544],
  [17477, 17476],
];

function assets() {
  const rows: unknown[] = [];
  let id = 2_000_000_000;
  for (const [s, station] of STATIONS.entries()) {
    for (const [i, typeId] of [...MINERALS, ...ORES, ...MOON_ORES, ...MODULES].entries()) {
      rows.push({
        item_id: id++,
        type_id: typeId,
        quantity: 500 + mix(typeId + s) * 400,
        location_id: station.stationId,
        location_type: 'station',
        location_flag: 'Hangar',
        is_singleton: false,
      });
      if (i % 5 === 0) {
        rows.push({
          item_id: id++,
          type_id: typeId,
          quantity: 120 + mix(typeId) * 7,
          location_id: station.stationId,
          location_type: 'station',
          location_flag: 'Deliveries',
          is_singleton: false,
        });
      }
    }
    for (const typeId of SHIPS) {
      rows.push({
        item_id: id++,
        type_id: typeId,
        quantity: 1,
        location_id: station.stationId,
        location_type: 'station',
        location_flag: 'Hangar',
        is_singleton: true,
      });
    }
    for (const [bp] of BLUEPRINTS) {
      rows.push({
        item_id: id++,
        type_id: bp,
        quantity: 1,
        location_id: station.stationId,
        location_type: 'station',
        location_flag: 'Hangar',
        is_singleton: true,
        is_blueprint_copy: bp % 2 === 0,
      });
    }
  }
  return rows;
}

function journal() {
  const refTypes = [
    ['player_donation', 1],
    ['market_transaction', 1],
    ['market_escrow', -1],
    ['brokers_fee', -1],
    ['bounty_prizes', 1],
    ['industry_job_tax', -1],
    ['player_trading', -1],
    ['transaction_tax', -1],
  ] as const;
  let balance = 1_234_567_890;
  return Array.from({ length: 80 }, (_, i) => {
    const [ref, sign] = refTypes[i % refTypes.length];
    const amount = sign * (250_000 + mix(i) * 91_000);
    balance -= amount;
    return {
      id: 5_000_000_000 + i,
      date: iso(-(i * 9 + 2) * HOUR_MS),
      ref_type: ref,
      description: ref.replace(/_/g, ' '),
      amount,
      balance,
      first_party_id: CHARACTER_ID,
      second_party_id: 91_000_000 + (i % 7),
    };
  });
}

function transactions() {
  return Array.from({ length: 40 }, (_, i) => ({
    transaction_id: 6_000_000_000 + i,
    date: iso(-(i * 14 + 3) * HOUR_MS),
    location_id: STATIONS[i % 2].stationId,
    type_id: [...MINERALS, ...SHIPS][i % (MINERALS.length + SHIPS.length)],
    unit_price: 5 + mix(i) * 12_000,
    quantity: 1 + (i % 5) * 200,
    client_id: 91_000_000 + (i % 9),
    is_buy: i % 3 === 0,
    is_personal: true,
    journal_ref_id: 5_000_000_000 + i,
  }));
}

function industryJobs() {
  const statuses = ['active', 'active', 'ready', 'delivered', 'paused'] as const;
  return Array.from({ length: 14 }, (_, i) => {
    const [bp, product] = BLUEPRINTS[i % BLUEPRINTS.length];
    const status = statuses[i % statuses.length];
    const station = STATIONS[i % 2];
    return {
      job_id: 700_000 + i,
      activity_id: i % 5 === 4 ? 3 : 1,
      blueprint_id: 2_100_000_000 + i,
      blueprint_type_id: bp,
      facility_id: station.stationId,
      station_id: station.stationId,
      output_location_id: station.stationId,
      runs: 1 + (i % 6),
      start_date: iso(-(i * 5 + 4) * HOUR_MS),
      end_date: iso(
        status === 'delivered' || status === 'ready' ? -(i + 1) * HOUR_MS : (i * 7 + 3) * HOUR_MS
      ),
      status,
      cost: 150_000 + mix(i) * 5_000,
      licensed_runs: 10,
      product_type_id: product,
    };
  });
}

function mining() {
  const rows: unknown[] = [];
  for (let back = 0; back < 25; back++) {
    if (back % 4 === 3) continue;
    const systemId = back % 3 === 0 ? 30002187 : back % 3 === 1 ? 30002053 : 30000144;
    for (const [i, typeId] of [...ORES, ...MOON_ORES].entries()) {
      if ((back + i) % 2 === 1) continue;
      rows.push({
        date: day(back),
        quantity: 6_000 + mix(back * 7 + i) * 90,
        solar_system_id: systemId,
        type_id: typeId,
      });
    }
  }
  return rows;
}

function orders() {
  return Array.from({ length: 12 }, (_, i) => ({
    order_id: 8_000_000_000 + i,
    type_id: [...MINERALS, ...SHIPS][i],
    region_id: 10000002,
    location_id: STATIONS[i % 2].stationId,
    is_buy_order: i % 3 === 0,
    is_corporation: false,
    price: 4.9 + mix(i) * 3_000,
    volume_total: 1_000 + i * 500,
    volume_remain: 400 + i * 120,
    issued: iso(-(i * 20 + 5) * HOUR_MS),
    duration: 90,
    range: 'region',
    escrow: i % 3 === 0 ? 1_000_000 : undefined,
  }));
}

function skillQueue() {
  return [3380, 3392, 3402, 3300].map((skillId, i) => ({
    skill_id: skillId,
    queue_position: i,
    finished_level: 3 + i,
    start_date: iso(i * 14 * HOUR_MS),
    finish_date: iso((i + 1) * 14 * HOUR_MS),
    level_start_sp: 8000,
    level_end_sp: 45_255,
    training_start_sp: 8000,
  }));
}

export async function installPersonalEsi(page: Page): Promise<void> {
  const c = `/characters/${CHARACTER_ID}`;
  const lists: Record<string, () => unknown> = {
    [`${c}/assets`]: assets,
    [`${c}/wallet/journal`]: journal,
    [`${c}/wallet/transactions`]: transactions,
    [`${c}/industry/jobs`]: industryJobs,
    [`${c}/mining/`]: mining,
    [`${c}/orders`]: orders,
    [`${c}/skillqueue`]: skillQueue,
    [`${c}/corporationhistory`]: social.corporationHistory,
    [`${c}/contracts`]: social.contracts,
    [`${c}/mail`]: social.mailHeaders,
    [`${c}/mail/labels`]: () => social.MAIL_LABELS,
    [`${c}/mail/lists`]: () => social.MAILING_LISTS,
    [`${c}/calendar`]: social.calendar,
    [`${c}/contacts`]: social.contacts,
    [`${c}/contacts/labels`]: () => social.CONTACT_LABELS,
  };
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'x-pages': '1' },
        body: JSON.stringify(body),
      });
    const list = lists[path];
    if (list) return json(list());
    const method = route.request().method();
    const corp = corpAnswer(
      path,
      method,
      method === 'POST' ? route.request().postDataJSON() : null
    );
    if (corp !== undefined) return json(corp);
    if (path === `${c}/roles`) return json({ roles: ['Director'] });
    const itemsMatch = /^\/characters\/\d+\/contracts\/(\d+)\/items$/.exec(path);
    if (itemsMatch) return json(social.contractItems(Number(itemsMatch[1])));
    const mailMatch = /^\/characters\/\d+\/mail\/(\d+)$/.exec(path);
    if (mailMatch) return json(social.mailBody(Number(mailMatch[1])));
    const eventMatch = /^\/characters\/\d+\/calendar\/(\d+)$/.exec(path);
    if (eventMatch) return json(social.calendarEvent(Number(eventMatch[1])));
    if (path === '/universe/names' && route.request().method() === 'POST') {
      const ids = route.request().postDataJSON() as number[];
      return json(
        ids.map((id) => ({
          id,
          ...(social.nameFor(id) ?? { name: `Unknown ${id}`, category: 'character' }),
        }))
      );
    }
    const system = /^\/universe\/systems\/(\d+)$/.exec(path);
    if (system && SYSTEM_NAMES[Number(system[1])]) {
      const id = Number(system[1]);
      return json({
        system_id: id,
        name: SYSTEM_NAMES[id],
        security_status: id === 30000142 ? 0.95 : 0.9,
        constellation_id: 20000020,
        star_id: 1,
      });
    }
    const station = /^\/universe\/stations\/(\d+)$/.exec(path);
    const known = station && STATIONS.find((s) => s.stationId === Number(station[1]));
    if (known) {
      return json({
        station_id: known.stationId,
        name: known.name,
        type_id: 52678,
        system_id: known.systemId,
        owner: 1000035,
      });
    }
    return route.fallback();
  });
}
