/**
 * D10's danger on the road from Yona to Dodixie. Arden is docked in Yona (Sinq Laison, 0.83).
 * Prefer shorter: Yona > Aporulie > Seyllin (0.41, lowsec) > Metserel > Erme > Botane > Dodixie, six jumps.
 * Prefer safer: eight jumps, every system highsec. Both counts come from the real stargate graph in
 * public/data/market, the same one the app routes on, so what is drawn is what the app computes.
 *
 * Seyllin gets three player kills in the last hour (the headline); every other system on either route
 * is quiet. Also here: the waypoint call (answers 204) and `installSeyllinChokepoint`, which serves the
 * app's own chokepoints module with Seyllin added to the community's list for this recording only (the
 * app source on disk is untouched; see the D10 report for why).
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mix } from '../../../sandbox/gen';
import { bookAt } from '../market';

const data = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`../../../../../public/data/market/${file}`, import.meta.url), 'utf8'));

export const YONA = 30005017;
export const YONA_STATION = 60005227; // Yona 8 - Moon 8 - Republic Security Services Assembly Plant
export const SEYLLIN = 30005020;
export const DODIXIE = 30002659;
const APORULIE = 30005019;
const METSEREL = 30002637;

interface SystemRow { id: number; name: string; security: number; regionId: number }
const systems = data<SystemRow[]>('systems.json');
const typeRows = JSON.parse(
  readFileSync(new URL('../../../../../public/data/types.json', import.meta.url), 'utf8')
) as Record<string, { name: string }>;
const typeByName = (name: string): number => {
  const id = Object.entries(typeRows).find(([, row]) => row.name === name)?.[0];
  if (!id) throw new Error(`no type ${name}`);
  return Number(id);
};

const MIN = 60_000;
const NAMES = new Map<number, { name: string; category: string }>();
const person = (id: number, name: string) => NAMES.set(id, { name, category: 'character' });
NAMES.set(93_100_001, { name: 'Black Ledger Reavers', category: 'corporation' });
NAMES.set(93_100_002, { name: 'Seyllin Toll Authority', category: 'corporation' });
NAMES.set(93_200_001, { name: 'Gatecrasher Syndicate', category: 'alliance' });
[
  'Veyra Dunmarch', 'Kolten Ashvale', 'Ryssa Orlund', 'Teague Morrow', 'Isolde Farrane', 'Brannic Holt',
  'Nessa Quillfeather', 'Dorran Vael', 'Ilsa Thornwick', 'Garrick Mose', 'Sennet Vauxhall', 'Perrin Ashdown',
].forEach((name, index) => person(93_000_001 + index, name));
const VICTIMS = [
  ['Iteron Mark V', 93_000_005], ['Badger', 93_000_006], ['Retriever', 93_000_007], ['Catalyst', 93_000_008],
  ['Occator', 93_000_009], ['Bestower', 93_000_010],
] as const;
const ATTACKER_SHIPS = ['Thrasher', 'Catalyst', 'Talwar', 'Cormorant', 'Hurricane', 'Sabre'].map(typeByName);

/** Stargates the kills happened at: id -> the system the gate leads to. */
const GATES = new Map<number, { name: string; system: number; to: number }>([
  [50_002_001, { name: 'Stargate (Aporulie)', system: SEYLLIN, to: APORULIE }],
  [50_002_002, { name: 'Stargate (Metserel)', system: SEYLLIN, to: METSEREL }],
]);

interface FakeKill { gate: number; ageMin: number; victim: number; attackers: number }
// Seyllin: exactly three in the last hour, then a thin trickle across the day.
const KILLS: FakeKill[] = [
  ...[9, 24, 47].map((ageMin, i) => ({ gate: i === 1 ? 50_002_002 : 50_002_001, ageMin, victim: i, attackers: 3 + i })),
  ...[130, 310, 520, 790].map((ageMin, i) => ({ gate: i % 2 ? 50_002_002 : 50_002_001, ageMin, victim: 3 + i, attackers: 2 + i })),
];

function killBody(kill: FakeKill, index: number) {
  const [victimShip, victimPilot] = VICTIMS[kill.victim % VICTIMS.length];
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
    killmail_id: 129_400_000 + index,
    killmail_time: new Date(Date.now() - kill.ageMin * MIN).toISOString(),
    solar_system_id: SEYLLIN,
    victim: {
      character_id: victimPilot,
      corporation_id: 93_100_002,
      ship_type_id: typeByName(victimShip),
      damage_taken: 3200 + index * 11,
    },
    attackers,
    zkb: { locationID: kill.gate, hash: `d10hash${index}`, totalValue: 21_000_000 + ((index * 7_310_000) % 120_000_000), npc: false },
  };
}

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*', 'x-pages': '1' },
  body: JSON.stringify(body),
});

/** Kills, jumps, stargates, names and the waypoint call, over the world's own answers. */
export async function installD10Danger(page: Page, waypointCalls: string[] = []) {
  await page.route('https://zkillboard.com/api/**', async (route) => {
    const url = route.request().url();
    const region = /regionID\/(\d+)\/pastSeconds\/(\d+)/.exec(url);
    const system = /systemID\/(\d+)\/pastSeconds\/(\d+)/.exec(url);
    const past = Number((region ?? system)?.[2] ?? 3600) * 1000;
    if (!region && !system) return route.fulfill(json([]));
    if (region && /page\/[2-9]/.test(url)) return route.fulfill(json([]));
    const inScope = region ? systems.find((row) => row.id === SEYLLIN)?.regionId === Number(region[1]) : Number(system![1]) === SEYLLIN;
    return route.fulfill(
      json(inScope ? KILLS.flatMap((kill, index) => (kill.ageMin * MIN <= past ? [killBody(kill, index)] : [])) : [])
    );
  });
  await page.route(/esi\.evetech\.net\/.*universe\/system_kills/, (route) =>
    route.fulfill(
      json([
        { system_id: SEYLLIN, ship_kills: 3, pod_kills: 0, npc_kills: 6 },
        { system_id: APORULIE, ship_kills: 0, pod_kills: 0, npc_kills: 12 },
        { system_id: DODIXIE, ship_kills: 0, pod_kills: 0, npc_kills: 4 },
      ])
    )
  );
  await page.route(/esi\.evetech\.net\/.*universe\/system_jumps/, (route) =>
    route.fulfill(
      json(systems.filter((row) => row.regionId === 10000064 || row.regionId === 10000032).map((row) => ({ system_id: row.id, ship_jumps: row.id === SEYLLIN ? 96 : 12 + (mix(row.id) % 70) })))
    )
  );
  await page.route(/esi\.evetech\.net\/.*universe\/stargates\/(\d+)/, (route) => {
    const gate = GATES.get(Number(/stargates\/(\d+)/.exec(route.request().url())![1]));
    if (!gate) return route.fallback();
    return route.fulfill(
      json({ stargate_id: 0, name: gate.name, system_id: gate.system, type_id: 16, position: { x: 0, y: 0, z: 0 }, destination: { stargate_id: 1, system_id: gate.to } })
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

/** Serves the app's chokepoints module with Seyllin added to the list, for this page only. */
export async function installSeyllinChokepoint(page: Page) {
  await page.route(/\/src\/engine\/route\/chokepoints\.ts(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    // Vite serves the module transformed, so the quotes may be either kind.
    const body = (await response.text()).replace(
      /\[30002813,\s*(['"])Tama\1\],/,
      (whole) => `${whole} [${SEYLLIN}, 'Seyllin'],`
    );
    await route.fulfill({ response, body });
  });
}

/** Hek's live order book: the shared world has no Metropolis book, which left Hek's sell total as a dash. */
export async function installHekBook(page: Page) {
  await page.route(/esi\.evetech\.net\/.*markets\/10000042\/orders/, (route) => {
    const url = new URL(route.request().url());
    const typeId = Number(url.searchParams.get('type_id'));
    const side = url.searchParams.get('order_type') ?? 'all';
    return route.fulfill(
      json(!typeId ? [] : bookAt(60005686, typeId).filter((order) => side === 'all' || (side === 'buy') === order.is_buy_order))
    );
  });
}
