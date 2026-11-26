/**
 * The world's market: the three characters' own orders, the competitors that undercut four of
 * them, and the filler depth around them. One function (`bookAt`) answers for a station and a
 * type; the Fuzzwork aggregates (best sell / best buy, which the Open Orders undercut check
 * reads), the region order books (the order-detail "who is cheaper" list) and the characters'
 * own order lists are all cuts of it, so they cannot disagree.
 */
import { DAY_MS, HOUR_MS } from '../../../../src/lib/age';
import { mix } from '../../sandbox/gen';
import { ARDEN, MIRA, STATION_PLACE, STATIONS, TOBIN, REGIONS } from './cast';
import { basePrice, T } from './catalog';

export interface BookOrder {
  order_id: number;
  type_id: number;
  location_id: number;
  system_id: number;
  is_buy_order: boolean;
  price: number;
  volume_total: number;
  volume_remain: number;
  min_volume: number;
  duration: number;
  range: string;
  issued: string;
}

/** Rounds to four significant digits, the market's price tick. */
export function tick4(price: number): number {
  if (price <= 0) return 0;
  const digits = Math.floor(Math.log10(price));
  const step = 10 ** Math.max(digits - 3, -2);
  return Math.round(Math.round(price / step) * step * 100) / 100;
}

/** How much dearer a station is than Jita for the same item. */
const PREMIUM: Record<number, number> = {
  [STATIONS.jita]: 0,
  [STATIONS.amarr]: 0.012,
  [STATIONS.dodixie]: 0.02,
  [STATIONS.rens]: 0.03,
  [STATIONS.nourvukaiken]: 0.045,
  [STATIONS.tunttaras]: 0.06,
  [STATIONS.sarekuwa]: 0.05,
};
const premium = (stationId: number) => PREMIUM[stationId] ?? 0.025 + (stationId % 7) * 0.006;

/** What an item fairly sells for at a station. */
export function fairPrice(stationId: number, typeId: number): number {
  return tick4(basePrice(typeId) * (1 + premium(stationId)));
}

interface OwnSpec {
  id: number;
  owner: number;
  typeId: number;
  station: number;
  buy?: boolean;
  /** Multiplier on the station's fair price. */
  adj?: number;
  total: number;
  remain: number;
  /** Hours since it was issued. */
  ageHours: number;
  duration?: number;
  /** A competitor lists this much cheaper (fraction of my price). */
  undercutBy?: number;
}

const d = (days: number, hours = 0) => days * 24 + hours;

/** Every open order of the cast. Expiry = issued + duration. */
export const OWN_ORDERS: readonly OwnSpec[] = [
  // Arden Kessil
  { id: 6_100_000_001, owner: ARDEN.id, typeId: T.drake, station: STATIONS.nourvukaiken, adj: 1.004, total: 14, remain: 9, ageHours: d(6, 5), undercutBy: 0.012 },
  { id: 6_100_000_002, owner: ARDEN.id, typeId: T.heavyMissileLauncherII, station: STATIONS.jita, adj: 0.996, total: 60, remain: 38, ageHours: d(9, 2) },
  { id: 6_100_000_003, owner: ARDEN.id, typeId: T.scourgeFury, station: STATIONS.tunttaras, adj: 1.01, total: 120_000, remain: 74_000, ageHours: d(4, 11), undercutBy: 0.021 },
  { id: 6_100_000_004, owner: ARDEN.id, typeId: T.damageControlII, station: STATIONS.jita, adj: 0.997, total: 30, remain: 17, ageHours: d(89, 6), duration: 90 },
  { id: 6_100_000_005, owner: ARDEN.id, typeId: T.largeShieldExtenderII, station: STATIONS.nourvukaiken, adj: 1.0, total: 12, remain: 7, ageHours: d(12, 8) },
  { id: 6_100_000_006, owner: ARDEN.id, typeId: T.ballisticControlII, station: STATIONS.jita, adj: 0.995, total: 40, remain: 26, ageHours: d(15, 1) },
  { id: 6_100_000_007, owner: ARDEN.id, typeId: T.hobgoblinII, station: STATIONS.nourvukaiken, adj: 0.998, total: 200, remain: 120, ageHours: d(3, 20) },
  { id: 6_100_000_008, owner: ARDEN.id, typeId: T.gila, station: STATIONS.jita, adj: 1.006, total: 4, remain: 3, ageHours: d(2, 7), undercutBy: 0.009 },
  { id: 6_100_000_009, owner: ARDEN.id, typeId: T.mediumShieldExtenderII, station: STATIONS.tunttaras, adj: 0.994, total: 80, remain: 61, ageHours: d(29, 14), duration: 30 },
  { id: 6_100_000_010, owner: ARDEN.id, typeId: T.warpDisruptorII, station: STATIONS.sarekuwa, adj: 0.997, total: 50, remain: 33, ageHours: d(21, 3) },
  { id: 6_100_000_011, owner: ARDEN.id, typeId: T.stasisWebifierII, station: STATIONS.jita, adj: 0.996, total: 45, remain: 40, ageHours: d(1, 9) },
  { id: 6_100_000_012, owner: ARDEN.id, typeId: T.tritanium, station: STATIONS.nourvukaiken, buy: true, adj: 0.93, total: 8_000_000, remain: 5_350_000, ageHours: d(8, 4), duration: 90 },
  // Mira Voskane
  { id: 6_200_000_001, owner: MIRA.id, typeId: T.largeShieldExtenderII, station: STATIONS.nourvukaiken, adj: 0.992, total: 10, remain: 6, ageHours: d(5, 3) },
  { id: 6_200_000_002, owner: MIRA.id, typeId: T.hurricane, station: STATIONS.nourvukaiken, adj: 0.997, total: 8, remain: 5, ageHours: d(7, 14) },
  { id: 6_200_000_003, owner: MIRA.id, typeId: T.retriever, station: STATIONS.tunttaras, adj: 1.008, total: 6, remain: 4, ageHours: d(3, 2), undercutBy: 0.016 },
  { id: 6_200_000_004, owner: MIRA.id, typeId: T.rifter, station: STATIONS.nourvukaiken, adj: 0.996, total: 25, remain: 14, ageHours: d(18, 6) },
  { id: 6_200_000_005, owner: MIRA.id, typeId: T.nanitePaste, station: STATIONS.tunttaras, adj: 0.998, total: 5_000, remain: 3_200, ageHours: d(10, 12) },
  { id: 6_200_000_006, owner: MIRA.id, typeId: T.inertialStabilizersII, station: STATIONS.jita, adj: 0.995, total: 60, remain: 44, ageHours: d(6, 18) },
  { id: 6_200_000_007, owner: MIRA.id, typeId: T.capBooster400, station: STATIONS.nourvukaiken, adj: 0.997, total: 25_000, remain: 17_200, ageHours: d(13, 7) },
  { id: 6_200_000_008, owner: MIRA.id, typeId: T.hornetII, station: STATIONS.sarekuwa, adj: 0.996, total: 400, remain: 250, ageHours: d(4, 1) },
  // Tobin Raske
  { id: 6_300_000_001, owner: TOBIN.id, typeId: T.cVeldspar, station: STATIONS.tunttaras, adj: 0.997, total: 1_500_000, remain: 980_000, ageHours: d(11, 5) },
  { id: 6_300_000_002, owner: TOBIN.id, typeId: T.cScordite, station: STATIONS.nourvukaiken, adj: 0.996, total: 600_000, remain: 410_000, ageHours: d(8, 9) },
  { id: 6_300_000_003, owner: TOBIN.id, typeId: T.cPyroxeres, station: STATIONS.tunttaras, adj: 0.998, total: 350_000, remain: 290_000, ageHours: d(2, 15) },
  { id: 6_300_000_004, owner: TOBIN.id, typeId: T.tritanium, station: STATIONS.jita, adj: 0.996, total: 20_000_000, remain: 14_300_000, ageHours: d(16, 3) },
  { id: 6_300_000_005, owner: TOBIN.id, typeId: T.pyerite, station: STATIONS.jita, adj: 0.997, total: 6_000_000, remain: 4_100_000, ageHours: d(5, 21) },
  { id: 6_300_000_006, owner: TOBIN.id, typeId: T.mexallon, station: STATIONS.nourvukaiken, adj: 0.996, total: 900_000, remain: 640_000, ageHours: d(9, 16) },
  { id: 6_300_000_007, owner: TOBIN.id, typeId: T.isogen, station: STATIONS.jita, buy: true, adj: 0.94, total: 600_000, remain: 412_000, ageHours: d(7, 2) },
];

export const ownPrice = (spec: OwnSpec) =>
  tick4(fairPrice(spec.station, spec.typeId) * (spec.adj ?? 1));

function ownAsBook(spec: OwnSpec): BookOrder {
  return {
    order_id: spec.id,
    type_id: spec.typeId,
    location_id: spec.station,
    system_id: STATION_PLACE[spec.station].systemId,
    is_buy_order: spec.buy ?? false,
    price: ownPrice(spec),
    volume_total: spec.total,
    volume_remain: spec.remain,
    min_volume: 1,
    duration: spec.duration ?? 90,
    range: spec.buy ? 'station' : 'region',
    issued: new Date(Date.now() - spec.ageHours * HOUR_MS).toISOString(),
  };
}

/** The competitor orders that undercut my sells (and their rivals are not the cast's own). */
function competitorFor(spec: OwnSpec): BookOrder {
  const mine = ownAsBook(spec);
  return {
    ...mine,
    order_id: 7_100_000_000 + (spec.id % 1000),
    price: tick4(mine.price * (1 - (spec.undercutBy ?? 0))),
    volume_total: Math.max(5, Math.round(spec.total * 1.6)),
    volume_remain: Math.max(3, Math.round(spec.remain * 1.3)),
    issued: new Date(Date.now() - (spec.ageHours / 3 + 5) * HOUR_MS).toISOString(),
  };
}

const ownByStationType = new Map<string, OwnSpec[]>();
for (const spec of OWN_ORDERS) {
  const key = `${spec.station}:${spec.typeId}`;
  ownByStationType.set(key, [...(ownByStationType.get(key) ?? []), spec]);
}

/** Orders of one item at one station: mine, the undercutters, and filler depth. Deterministic. */
export function bookAt(stationId: number, typeId: number): BookOrder[] {
  const place = STATION_PLACE[stationId];
  const systemId = place?.systemId ?? stationId;
  const own = ownByStationType.get(`${stationId}:${typeId}`) ?? [];
  const orders: BookOrder[] = own.map(ownAsBook);
  for (const spec of own) if (spec.undercutBy) orders.push(competitorFor(spec));

  const fair = fairPrice(stationId, typeId);
  const mySells = orders.filter((o) => !o.is_buy_order).map((o) => o.price);
  const floor = mySells.length > 0 ? Math.max(...mySells) : fair * 0.999;
  const myBuys = orders.filter((o) => o.is_buy_order).map((o) => o.price);
  const ceil = myBuys.length > 0 ? Math.min(...myBuys) : fair * 0.93;
  const seed = mix(stationId + typeId * 3);
  const filler = (index: number, buy: boolean): BookOrder => {
    const price = buy
      ? tick4(Math.min(ceil, fair * 0.93) * (1 - 0.006 * (index + 1)))
      : tick4(Math.max(floor, fair) * (1 + 0.007 + 0.011 * index));
    return {
      order_id: 7_000_000_000 + ((stationId * 31 + typeId * 7 + index * 3 + (buy ? 1 : 0)) % 900_000_000),
      type_id: typeId,
      location_id: stationId,
      system_id: systemId,
      is_buy_order: buy,
      price,
      volume_total: 400 + ((seed + index * 97) % 4000),
      volume_remain: 150 + ((seed * (index + 2)) % 3000),
      min_volume: 1,
      duration: 90,
      range: buy ? 'region' : 'region',
      issued: new Date(Date.now() - ((seed + index * 13) % 400) * HOUR_MS).toISOString(),
    };
  };
  for (let i = 0; i < 3; i += 1) orders.push(filler(i, false));
  for (let i = 0; i < 2; i += 1) orders.push(filler(i, true));
  return orders;
}

/** Stations a region's book is made of. */
const REGION_STATIONS: Record<number, number[]> = {
  [REGIONS.lonetrek]: [STATIONS.nourvukaiken, STATIONS.tunttaras, STATIONS.sarekuwa],
  [REGIONS.forge]: [STATIONS.jita],
  [REGIONS.domain]: [STATIONS.amarr],
  [REGIONS.sinqLaison]: [STATIONS.dodixie],
  [REGIONS.heimatar]: [STATIONS.rens],
};

export function regionBook(regionId: number, typeId: number): BookOrder[] {
  const stations = REGION_STATIONS[regionId];
  if (!stations) {
    // Another region: one generic station so a region view is never empty.
    return bookAt(regionId * 10 + 3, typeId).map((order) => ({ ...order, location_id: 60_000_000 + (regionId % 1000) * 4 }));
  }
  return stations.flatMap((station) => bookAt(station, typeId));
}

export interface Aggregate {
  buy: { max: string; min: string; volume: string; orderCount: string; weightedAverage: string; median: string };
  sell: { max: string; min: string; volume: string; orderCount: string; weightedAverage: string; median: string };
}

function side(orders: BookOrder[], pick: 'min' | 'max') {
  if (orders.length === 0) {
    return { max: '0', min: '0', volume: '0', orderCount: '0', weightedAverage: '0', median: '0' };
  }
  const prices = orders.map((o) => o.price);
  const volume = orders.reduce((sum, o) => sum + o.volume_remain, 0);
  const avg = orders.reduce((sum, o) => sum + o.price * o.volume_remain, 0) / Math.max(volume, 1);
  const best = pick === 'min' ? Math.min(...prices) : Math.max(...prices);
  return {
    max: String(Math.max(...prices)),
    min: String(Math.min(...prices)),
    volume: String(volume),
    orderCount: String(orders.length),
    weightedAverage: String(avg),
    median: String(best),
  };
}

export function aggregate(orders: BookOrder[]): Aggregate {
  return {
    buy: side(orders.filter((o) => o.is_buy_order), 'max'),
    sell: side(orders.filter((o) => !o.is_buy_order), 'min'),
  };
}

/** 90 days of daily history for a region, anchored on the fair price. */
export function history(regionId: number, typeId: number) {
  const anchor = basePrice(typeId) * (1 + (regionId === REGIONS.forge ? 0 : 0.02));
  return Array.from({ length: 90 }, (_, index) => {
    const back = 89 - index;
    const wobble = 1 + (mix(typeId + index * 11) - 500) / 9000 + Math.sin(index / 9) * 0.012;
    const average = tick4(anchor * wobble);
    return {
      date: new Date(Date.now() - (back + 1) * DAY_MS).toISOString().slice(0, 10),
      average,
      highest: tick4(average * 1.018),
      lowest: tick4(average * 0.984),
      order_count: 40 + (mix(typeId + index) % 160),
      volume: Math.round(3_000_000 / Math.max(anchor, 1)) + (mix(index * 5 + typeId) % 900) * 7,
    };
  });
}
