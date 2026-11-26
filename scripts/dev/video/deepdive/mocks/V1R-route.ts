/**
 * D5's mock market and mock danger: the module "Drone Damage Amplifier II" is cheapest at Oisio,
 * six jumps from Nourvukaiken on Prefer shorter (through Tama, a lowsec gank chokepoint with
 * recent kills) and eight on Prefer safer (all highsec). Everything is derived from the real
 * stargate graph in public/data/market, so the jump counts the app draws are the ones here.
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { findJumpRoute } from '../../../../../functions/src/jumpRoute';
import { mix } from '../../../sandbox/gen';

const data = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`../../../../../public/data/market/${file}`, import.meta.url), 'utf8'));

export const NOURVUKAIKEN = 30001376;
export const OISIO = 30002799;
export const TAMA = 30002813;
/** The module the cheap book is for: Caldari Navy Multispectrum Shield Hardener, the swap the fit takes in ch05. */
export const MISSING_MODULE = 17498;
export const MISSING_MODULE_PRICE = 735; // the world's own price for it, so the appraisal and the book agree

interface SystemRow { id: number; name: string; security: number; regionId: number }
interface StationRow { id: number; name: string; systemId: number }
const systems = data<SystemRow[]>('systems.json');
const stations = data<StationRow[]>('stations.json');
const bySystem = new Map(systems.map((row) => [row.id, row]));
const graph = new Map<number, number[]>(
  Object.entries(data<Record<string, number[]>>('jumps.json')).map(([id, to]) => [Number(id), to])
);
const typeRows = JSON.parse(
  readFileSync(new URL('../../../../../public/data/types.json', import.meta.url), 'utf8')
) as Record<string, { name: string }>;
const typeByName = (name: string): number => {
  const id = Object.entries(typeRows).find(([, row]) => row.name === name)?.[0];
  if (!id) throw new Error(`no type ${name}`);
  return Number(id);
};

const sec = (id: number) => bySystem.get(id)?.security;
export function jumpsUnder(preference: 'shortest' | 'prefer-highsec', to: number, avoid: number[] = []) {
  const r = findJumpRoute(graph, NOURVUKAIKEN, to, {
    preference,
    securityOf: sec,
    securityPenalty: 50,
    avoid: new Set(avoid),
  });
  return r.kind === 'route' ? r.systems.length - 1 : null;
}

const hash = (n: number) => Math.abs(Math.imul(n ^ (n >>> 15), 2246822519) ^ Math.imul(n, 3266489917)) >>> 3;

/** Station price multipliers: nearer ones dearer, Oisio the cheapest. */
const FORCED: Record<number, number> = {
  60003832: 1.092, // Nourvukaiken 3 (0 jumps)
  60003826: 1.071, // Tunttaras 10 (1)
  60003760: 1.034, // Jita 4-4 (3)
  60003844: 0.931, // Oisio 5 - Moon 6 (6 on Prefer shorter)
  60003856: 0.964, // Oisio 5 - Moon 1
  60004417: 0.985, // Oisio 6 - Moon 1
};

function stationsNear(): StationRow[] {
  const out: StationRow[] = [];
  for (const station of stations) {
    if (station.id in FORCED) {
      out.push(station);
      continue;
    }
    const a = jumpsUnder('shortest', station.systemId);
    if (a === null || a > 11) continue;
    if (hash(station.id) % 22 === 0) out.push(station);
  }
  return out;
}
const NEAR = stationsNear();

export function v1rRegionOrders(regionId: number, typeId: number): unknown[] {
  if (typeId !== MISSING_MODULE) return [];
  const orders: unknown[] = [];
  let id = regionId * 1000 + 5_000_000_000;
  for (const station of NEAR) {
    const row = bySystem.get(station.systemId);
    if (!row || row.regionId !== regionId) continue;
    const seed = hash(station.id + 7);
    const factor = FORCED[station.id] ?? 1.05 + (seed % 100) / 1000;
    const count = station.id in FORCED ? 3 : 1 + (seed % 2);
    for (let n = 0; n < count; n += 1) {
      orders.push({
        order_id: id++,
        type_id: typeId,
        location_id: station.id,
        system_id: station.systemId,
        is_buy_order: false,
        price: Math.round(MISSING_MODULE_PRICE * (factor + n * 0.006) * 100) / 100,
        volume_total: 60,
        volume_remain: station.id === 60003844 ? 38 - n * 9 : 4 + ((seed >> n) % 22),
        min_volume: 1,
        duration: 90,
        range: 'region',
        issued: new Date(Date.now() - (2 + ((seed + n * 7) % 60)) * 3_600_000).toISOString(),
      });
    }
    orders.push({
      order_id: id++,
      type_id: typeId,
      location_id: station.id,
      system_id: station.systemId,
      is_buy_order: true,
      price: Math.round(MISSING_MODULE_PRICE * (factor - 0.09) * 100) / 100,
      volume_total: 40,
      volume_remain: 12 + (seed % 20),
      min_volume: 1,
      duration: 90,
      range: 'region',
      issued: new Date(Date.now() - (5 + (seed % 40)) * 3_600_000).toISOString(),
    });
  }
  return orders;
}

// ---- danger on the route ----
const NOW = () => Date.now();
const MIN = 60_000;
const NAMES = new Map<number, { name: string; category: string }>();
const person = (id: number, name: string) => NAMES.set(id, { name, category: 'character' });
const corp = (id: number, name: string) => NAMES.set(id, { name, category: 'corporation' });
const alliance = (id: number, name: string) => NAMES.set(id, { name, category: 'alliance' });
corp(93_100_001, 'Black Ledger Reavers');
corp(93_100_002, 'Tama Toll Authority');
alliance(93_200_001, 'Gatecrasher Syndicate');
[
  'Veyra Dunmarch', 'Kolten Ashvale', 'Ryssa Orlund', 'Teague Morrow', 'Isolde Farrane', 'Brannic Holt',
  'Nessa Quillfeather', 'Dorran Vael', 'Ilsa Thornwick', 'Garrick Mose', 'Sennet Vauxhall', 'Perrin Ashdown',
].forEach((name, index) => person(93_000_001 + index, name));
const VICTIMS = [
  ['Iteron Mark V', 93_000_005, 93_100_002], ['Badger', 93_000_006, 93_100_002], ['Retriever', 93_000_007, 93_100_002],
  ['Catalyst', 93_000_008, 93_100_002], ['Occator', 93_000_009, 93_100_002], ['Bestower', 93_000_010, 93_100_002],
] as const;
const ATTACKER_SHIPS = ['Thrasher', 'Catalyst', 'Talwar', 'Cormorant', 'Hurricane', 'Sabre'].map(typeByName);

/** Stargates the kills happened at: id -> the system the gate leads to. */
const GATES = new Map<number, { name: string; to: number }>([
  [50_001_001, { name: 'Stargate (Sujarento)', to: 30002809 }],
  [50_001_002, { name: 'Stargate (Nourvukaiken)', to: NOURVUKAIKEN }],
  [50_001_003, { name: 'Stargate (Hasmijaala)', to: 30002806 }],
  [50_001_004, { name: 'Stargate (Nagamanen)', to: 30002807 }],
]);

interface FakeKill { system: number; gate: number; ageMin: number; victim: number; attackers: number }
// Tama: exactly 3 in the last hour (the headline), 24 more across the day. A few on the neighbours.
const KILLS: FakeKill[] = [
  ...[3, 12, 41].map((ageMin, i) => ({ system: TAMA, gate: i < 4 ? 50_001_001 : 50_001_002, ageMin, victim: i % 6, attackers: 3 + (i % 4) })),
  ...Array.from({ length: 24 }, (_, i) => ({ system: TAMA, gate: i % 2 ? 50_001_001 : 50_001_002, ageMin: 90 + i * 52, victim: i % 6, attackers: 2 + (i % 5) })),
  { system: 30002809, gate: 50_001_003, ageMin: 134, victim: 2, attackers: 2 }, // Sujarento
  { system: 30002809, gate: 50_001_003, ageMin: 480, victim: 3, attackers: 4 },
  { system: 30002806, gate: 50_001_004, ageMin: 151, victim: 1, attackers: 3 }, // Hasmijaala
  { system: 30002806, gate: 50_001_004, ageMin: 610, victim: 0, attackers: 5 },
];

function killBody(kill: FakeKill, index: number) {
  const [victimShip, victimPilot, victimCorp] = VICTIMS[kill.victim % VICTIMS.length];
  const attackers = Array.from({ length: kill.attackers }, (_, n) => ({
    character_id: 93_000_001 + ((index + n) % 4),
    corporation_id: 93_100_001,
    alliance_id: 93_200_001,
    ship_type_id: ATTACKER_SHIPS[(index + n) % ATTACKER_SHIPS.length],
    weapon_type_id: 2873,
    damage_done: 800 + n * 130,
    final_blow: n === 0,
    security_status: -4.2,
  }));
  return {
    killmail_id: 128_400_000 + index,
    killmail_time: new Date(NOW() - kill.ageMin * MIN).toISOString(),
    solar_system_id: kill.system,
    victim: {
      character_id: victimPilot,
      corporation_id: victimCorp,
      ship_type_id: typeByName(victimShip),
      damage_taken: 3200 + index * 11,
    },
    attackers,
    zkb: { locationID: kill.gate, hash: `d5hash${index}`, totalValue: 18_000_000 + ((index * 7_310_000) % 160_000_000), npc: false },
  };
}

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*', 'x-pages': '1' },
  body: JSON.stringify(body),
});

/** Kills, jumps, stargates, names and the waypoint call, over the world's own answers. */
export async function installV1rDanger(page: Page, waypointCalls: string[] = []) {
  await page.route('https://zkillboard.com/api/**', async (route) => {
    const url = route.request().url();
    const region = /regionID\/(\d+)\/pastSeconds\/(\d+)/.exec(url);
    const system = /systemID\/(\d+)\/pastSeconds\/(\d+)/.exec(url);
    const past = Number((region ?? system)?.[2] ?? 3600) * 1000;
    if (!region && !system) return route.fulfill(json([]));
    if (region && /page\/[2-9]/.test(url)) return route.fulfill(json([]));
    const wanted = (kill: FakeKill) =>
      kill.ageMin * MIN <= past &&
      (region ? bySystem.get(kill.system)?.regionId === Number(region[1]) : kill.system === Number(system![1]));
    return route.fulfill(
      json(KILLS.flatMap((kill, index) => (wanted(kill) ? [killBody(kill, index)] : [])))
    );
  });
  await page.route(/esi\.evetech\.net\/.*universe\/system_kills/, (route) =>
    route.fulfill(
      json([
        { system_id: TAMA, ship_kills: 3, pod_kills: 0, npc_kills: 11 },
        { system_id: 30002809, ship_kills: 0, pod_kills: 0, npc_kills: 4 },
        { system_id: 30002806, ship_kills: 0, pod_kills: 0, npc_kills: 2 },
        { system_id: 30002796, ship_kills: 0, pod_kills: 0, npc_kills: 9 },
        { system_id: 30001374, ship_kills: 0, pod_kills: 0, npc_kills: 3 },
      ])
    )
  );
  await page.route(/esi\.evetech\.net\/.*universe\/system_jumps/, (route) =>
    route.fulfill(
      json(
        systems
          .filter((row) => row.regionId === 10000033 || row.regionId === 10000016)
          .map((row) => ({ system_id: row.id, ship_jumps: row.id === TAMA ? 212 : 8 + (mix(row.id) % 90) }))
      )
    )
  );
  await page.route(/esi\.evetech\.net\/.*universe\/stargates\/(\d+)/, (route) => {
    const gate = GATES.get(Number(/stargates\/(\d+)/.exec(route.request().url())![1]));
    if (!gate) return route.fallback();
    return route.fulfill(
      json({ stargate_id: 0, name: gate.name, system_id: TAMA, type_id: 16, position: { x: 0, y: 0, z: 0 }, destination: { stargate_id: 1, system_id: gate.to } })
    );
  });
  await page.route(/esi\.evetech\.net\/.*universe\/names/, (route) => {
    const ids = JSON.parse(route.request().postData() ?? '[]') as number[];
    if (ids.length === 0 || !ids.every((id) => NAMES.has(id))) return route.fallback();
    return route.fulfill(json(ids.map((id) => ({ id, ...NAMES.get(id)! }))));
  });
  const GROUPS: Record<number, string> = { 420: 'Destroyer', 419: 'Combat Battlecruiser', 541: 'Interdictor', 31: 'Shuttle' };
  await page.route(/esi\.evetech\.net\/.*universe\/groups\/(\d+)/, (route) => {
    const id = Number(/groups\/(\d+)/.exec(route.request().url())![1]);
    if (!GROUPS[id]) return route.fallback();
    return route.fulfill(json({ group_id: id, name: GROUPS[id], category_id: 6, published: true, types: [] }));
  });
  await page.route(/esi\.evetech\.net\/.*ui\/autopilot\/waypoint/, (route) => {
    waypointCalls.push(new URL(route.request().url()).search);
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  });
}

/** Every region answers with the cheap-at-Oisio book of the drone amplifier. */
export async function installV1rMarket(page: Page) {
  await page.route(/esi\.evetech\.net\/.*markets\/(\d+)\/orders/, (route) => {
    const url = new URL(route.request().url());
    const regionId = Number(/markets\/(\d+)\/orders/.exec(url.pathname)![1]);
    const typeId = Number(url.searchParams.get('type_id'));
    if (typeId !== MISSING_MODULE) return route.fallback();
    return route.fulfill(json(v1rRegionOrders(regionId, typeId)));
  });
}

