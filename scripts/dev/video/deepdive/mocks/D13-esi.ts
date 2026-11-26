/** D13: Halcyon Forge Industries' corporation reads (roster, roles, structures, extractions, jobs, names). Install via openWorld's `before`. */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ALLIANCE, CORPORATION, STATIONS, SYSTEMS } from '../cast';
import {
  CEO, CORP_ID, DAY, EXTRA_NAMES, HOUR, MEMBERS, STRUCTURES, memberByName,
} from './D13-hfind';

const data = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`../../../../../public/data/${file}`, import.meta.url), 'utf8'));
const SYSTEM_ROWS = new Map(data<{ id: number; name: string; security: number }[]>('market/systems.json').map((r) => [r.id, r]));
const STATION_ROWS = new Map(data<{ id: number; name: string }[]>('market/stations.json').map((r) => [r.id, r]));
const REGION_ROWS = new Map(data<{ id: number; name: string }[]>('market/regions.json').map((r) => [r.id, r]));
const TYPES = data<Record<string, { name: string }>>('types.json');

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const ACAO = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-pages' };
const MOON_BY_ID = new Map(STRUCTURES.filter((s) => s.moonId).map((s) => [s.moonId!, s]));

export function nameOf(id: number): { name: string; category: string } | undefined {
  const member = MEMBERS.find((m) => m.id === id);
  if (member) return { name: member.name, category: 'character' };
  const extra = EXTRA_NAMES.get(id);
  if (extra) return extra;
  if (id === 98_000_001) return { name: CORPORATION.name, category: 'corporation' };
  if (id === ALLIANCE.id) return { name: ALLIANCE.name, category: 'alliance' };
  const lfc = LFC_MEMBERS.find((m) => m.id === id);
  if (lfc) return { name: lfc.name, category: 'character' };
  const lfcS = LFC_STRUCTURES.find((x) => x.structure_id === id);
  if (lfcS) return { name: lfcS.name!, category: 'structure' };
  const structure = STRUCTURES.find((s) => s.id === id);
  if (structure) return { name: structure.name, category: 'structure' };
  const moon = MOON_BY_ID.get(id);
  if (moon) return { name: moon.moonName!, category: 'moon' };
  if (STATION_ROWS.has(id)) return { name: STATION_ROWS.get(id)!.name, category: 'station' };
  if (SYSTEM_ROWS.has(id)) return { name: SYSTEM_ROWS.get(id)!.name, category: 'solar_system' };
  if (REGION_ROWS.has(id)) return { name: REGION_ROWS.get(id)!.name, category: 'region' };
  if (TYPES[String(id)] && id < 200_000) return { name: TYPES[String(id)].name, category: 'inventory_type' };
  return undefined;
}

const LFC_ID = 98_000_002;
const LFC_MEMBERS = [
  { id: 90_000_012, name: 'Tobin Raske' },
  ...['Aldous Fennick', 'Brannoch Hale', 'Ysolde Verrin', 'Corwen Tate', 'Maelis Dunrow'].map((name, i) => ({ id: 95_300_001 + i, name })),
];
const LFC_STRUCTURES = [
  { structure_id: 1_050_000_000_001, corporation_id: LFC_ID, system_id: 30001377, type_id: 35833, profile_id: 1, name: 'Sarekuwa - Lantern Freight Depot', fuel_expires: iso(5.5 * DAY), reinforce_hour: 19, state: 'shield_vulnerable', services: [{ name: 'Market', state: 'online' }, { name: 'Cloning', state: 'online' }] },
  { structure_id: 1_050_000_000_002, corporation_id: LFC_ID, system_id: 30001379, type_id: 35835, profile_id: 1, name: 'Tunttaras - Lantern Freight Drill', fuel_expires: iso(16 * DAY), reinforce_hour: 19, state: 'shield_vulnerable', services: [{ name: 'Moon Drilling', state: 'online' }, { name: 'Reprocessing', state: 'online' }] },
];
const SYSTEM_SECURITY = (id: number) => SYSTEM_ROWS.get(id)?.security ?? 0.8;

function structures() {
  return STRUCTURES.map((s, i) => ({
    structure_id: s.id,
    corporation_id: CORP_ID,
    system_id: s.systemId,
    type_id: s.typeId,
    profile_id: 1,
    name: s.name,
    ...(s.fuelDays === null ? {} : { fuel_expires: iso(s.fuelDays * DAY) }),
    reinforce_hour: 18 + (i % 3),
    state: s.state,
    ...(s.timerHours ? { state_timer_start: iso(-2 * HOUR), state_timer_end: iso(s.timerHours * HOUR) } : {}),
    services: s.services.map(([name, state]) => ({ name, state })),
  }));
}

/** Hours until chunk arrival per refinery, plus a second, later chunk on two of them. */
const ARRIVALS = [31, 4.5, 118, 205, 66, 14];
function extractions() {
  return STRUCTURES.filter((s) => s.refinery).map((s, i) => ({
    structure_id: s.id,
    moon_id: s.moonId!,
    extraction_start_time: iso((ARRIVALS[i] - 168) * HOUR),
    chunk_arrival_time: iso(ARRIVALS[i] * HOUR),
    natural_decay_time: iso((ARRIVALS[i] + 48) * HOUR),
  }));
}

/** [blueprint type, product, runs, hours until end (negative: finished), status, installer name, facility] */
const JOBS: [number, number, number, number, string, string, number][] = [
  [24703, 24702, 5, 7, 'active', 'Joren Fell', STRUCTURES[7].id],
  [24703, 24702, 5, 26, 'active', 'Petra Lindqvist', STRUCTURES[7].id],
  [691, 587, 10, 3.5, 'active', 'Mira Voskane', STRUCTURES[7].id],
  [17479, 17478, 3, 52, 'active', 'Joren Fell', STRUCTURES[6].id],
  [3842, 3841, 6, 11, 'active', 'Mira Voskane', STRUCTURES[6].id],
  [2739, 28668, 20, -3, 'ready', 'Petra Lindqvist', STRUCTURES[7].id],
  [11288, 11287, 40, -9, 'ready', 'Joren Fell', STRUCTURES[6].id],
  [2467, 2466, 30, 78, 'active', 'Kaelen Voss', STRUCTURES[7].id],
];
function jobs() {
  return JOBS.map(([bp, product, runs, hours, status, installer, facility], i) => ({
    job_id: 810_000 + i,
    installer_id: memberByName(installer).id,
    activity_id: 1,
    blueprint_id: 2_300_000_000 + i,
    blueprint_type_id: bp,
    blueprint_location_id: facility,
    output_location_id: facility,
    facility_id: facility,
    location_id: facility,
    runs,
    start_date: iso((hours - 30) * HOUR),
    end_date: iso(hours * HOUR),
    status,
    cost: 310_000 + i * 41_000,
    licensed_runs: 10,
    product_type_id: product,
  }));
}

const PER_DAY: Record<number, number> = { 35835: 132, 35836: 188, 35833: 356, 35825: 184 };
let assetId = 3_100_000_000;
function assets() {
  return STRUCTURES.flatMap((s) => [
    { item_id: assetId++, type_id: 4312, quantity: Math.round(PER_DAY[s.typeId] * (s.fuelDays ?? 0)), location_id: s.id, location_type: 'other', location_flag: 'StructureFuel', is_singleton: false },
    ...(s.refinery ? [{ item_id: assetId++, type_id: 45491, quantity: 40_000 + (s.id % 7) * 9_000, location_id: s.id, location_type: 'other', location_flag: 'CorpSAG1', is_singleton: false }] : []),
  ]);
}
const roles = () => MEMBERS.map((m) => ({ character_id: m.id, roles: m.roles, grantable_roles: m.roles.includes('Director') ? ['Director', 'Station_Manager'] : [] }));
const tracking = () =>
  MEMBERS.map((m, i) => ({
    character_id: m.id,
    start_date: iso(-m.joinedDaysAgo * DAY),
    ...(m.silentDays === null
      ? {}
      : {
          location_id: i % 2 ? STRUCTURES[6].id : STRUCTURES[0].id,
          ship_type_id: m.ship,
          logon_date: iso(-(m.silentDays * DAY + 3 * HOUR)),
          logoff_date: iso(-m.silentDays * DAY),
        }),
  }));
const TITLES = [
  { title_id: 1, name: 'Director', roles: ['Director'] },
  { title_id: 2, name: 'Miner', roles: [] },
  { title_id: 4, name: 'Hauler', roles: ['Hangar_Take_1'] },
];
const WALLETS = [1, 2, 3, 4, 5, 6, 7].map((division) => ({ division, balance: [4_820_000_000, 1_265_000_000, 212_000_000, 318_000_000, 0, 41_000_000, 0][division - 1] }));
const ROLE_HISTORY = [
  { changed_at: iso(-3 * DAY), character_id: memberByName('Oriel Tanvar').id, issuer_id: CEO.id, role_type: 'roles', old_roles: ['Junior_Accountant'], new_roles: ['Accountant', 'Junior_Accountant'] },
  { changed_at: iso(-9 * DAY), character_id: memberByName('Nikolai Brandt').id, issuer_id: CEO.id, role_type: 'roles', old_roles: ['Personnel_Manager'], new_roles: ['Director', 'Personnel_Manager'] },
  { changed_at: iso(-17 * DAY), character_id: memberByName('Thessaly Crane').id, issuer_id: CEO.id, role_type: 'roles', old_roles: [], new_roles: ['Contract_Manager'] },
];

function journal() {
  return Array.from({ length: 40 }, (_, i) => ({
    id: 900_001 + i,
    date: iso(-(i * 0.7 + 0.2) * DAY),
    ref_type: i % 5 === 3 ? 'structure_gate_jump' : 'player_donation',
    amount: i % 5 === 3 ? -(2_400_000 + i * 90_000) : 6_000_000 + ((i * 7919) % 31) * 1_100_000,
    balance: 4_820_000_000 - i * 3_000_000,
    first_party_id: MEMBERS[3 + (i % 30)].id,
    second_party_id: CORP_ID,
    description: 'moon tax',
    reason: 'moon tax',
  }));
}

const MOON_PRICE: Record<number, number> = { 45490: 1200, 45491: 1500, 45492: 1000 };
export async function installHalcyonEsi(page: Page): Promise<void> {
  await page.route('https://data.neocomdesk.com/open-prices/**', async (route) => {
    const typeId = Number(/\/open-prices\/(\d+)\.json$/.exec(new URL(route.request().url()).pathname)?.[1]);
    const price = MOON_PRICE[typeId];
    if (!price) return route.fallback();
    const dates = Array.from({ length: 30 }, (_, d) => new Date(Date.now() - (30 - d) * DAY).toISOString().slice(0, 10));
    const hubs = [60003760, 60008494, 60011866, 60004588, 60005686, 60015249];
    const stations = Object.fromEntries(hubs.map((id) => [String(id), { sell: dates.map(() => price), buy: dates.map(() => Math.round(price * 0.93)) }]));
    await route.fulfill({ status: 200, headers: ACAO, contentType: 'application/json', body: JSON.stringify({ dates, stations }) });
  });
  await page.route('https://esi.evetech.net/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/(latest|dev|v\d+)\//, '/');
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { ...ACAO, 'x-pages': '1', expires: new Date(Date.now() + 3_600_000).toUTCString() }, body: JSON.stringify(body) });
    const lfc = `/corporations/${LFC_ID}`;
    if (path === lfc) return json({ name: 'Lantern Freight Cooperative', ticker: 'LANFR', ceo_id: 95_300_001, creator_id: 95_300_001, member_count: LFC_MEMBERS.length, tax_rate: 0.05, alliance_id: ALLIANCE.id, home_station_id: STATIONS.sarekuwa, date_founded: '2022-02-09T10:00:00Z', description: 'Freight and fuel runs across Lonetrek.', url: '' });
    if (path === '/characters/90000012') return json({ name: 'Tobin Raske', corporation_id: LFC_ID, alliance_id: ALLIANCE.id, birthday: '2021-01-19T11:05:00Z', bloodline_id: 4, gender: 'male', race_id: 2, security_status: 1.1 });
    if (path === '/characters/90000012/roles') return json({ roles: ['Director', 'Station_Manager', 'Accountant'] });
    if (path.startsWith(`${lfc}/`) || path.startsWith(`/corporation/${LFC_ID}/`)) {
      const rest = path.replace(lfc, '').replace(`/corporation/${LFC_ID}`, '');
      const lfcTable: Record<string, unknown> = {
        '/members': LFC_MEMBERS.map((m) => m.id),
        '/roles': LFC_MEMBERS.map((m, i) => ({ character_id: m.id, roles: i < 2 ? ['Director', 'Station_Manager'] : [], grantable_roles: [] })),
        '/membertracking': LFC_MEMBERS.map((m, i) => ({ character_id: m.id, start_date: iso(-(200 + i * 40) * DAY), location_id: LFC_STRUCTURES[0].structure_id, ship_type_id: 28606, logon_date: iso(-(i * 9 + 4) * HOUR), logoff_date: iso(-(i * 9 + 1) * HOUR) })),
        '/titles': [], '/members/titles': [], '/roles/history': [],
        '/structures': LFC_STRUCTURES,
        '/mining/extractions': [{ structure_id: LFC_STRUCTURES[1].structure_id, moon_id: 40_139_050, extraction_start_time: iso(-96 * HOUR), chunk_arrival_time: iso(9 * HOUR), natural_decay_time: iso(57 * HOUR) }],
        '/industry/jobs': [], '/wallets': [{ division: 1, balance: 912_000_000 }], '/assets': [], '/orders': [], '/contracts': [], '/blueprints': [],
        '/mining/observers': [], '/structures/skyhooks': [], '/structures/sovereignty-hubs': [], '/starbases': [], '/customs_offices': [],
        '/divisions': { hangar: [], wallet: [{ division: 1, name: 'Master Wallet' }] },
      };
      if (rest in lfcTable) return json(lfcTable[rest]);
      if (/^\/wallets\/\d+\/(journal|transactions)$/.test(rest)) return json([]);
    }
    const corp = `/corporations/${CORP_ID}`;
    if (path === '/universe/names' && request.method() === 'POST') {
      const ids = request.postDataJSON() as number[];
      return json(ids.map((id) => ({ id, ...(nameOf(id) ?? { name: `Pilot ${id}`, category: 'character' }) })));
    }
    if (path === '/characters/affiliation' && request.method() === 'POST') {
      const ids = request.postDataJSON() as number[];
      return json(ids.map((id) => ({ character_id: id, corporation_id: id === 90_000_012 ? LFC_ID : MEMBERS.some((m) => m.id === id) ? CORP_ID : 92_000_001 })));
    }
    if (path === corp)
      return json({
        name: CORPORATION.name, ticker: CORPORATION.ticker, ceo_id: CEO.id, creator_id: CEO.id, member_count: MEMBERS.length,
        tax_rate: 0.08, alliance_id: ALLIANCE.id, home_station_id: STATIONS.nourvukaiken, date_founded: '2021-04-17T19:30:00Z',
        description: 'Mining, manufacturing and missile logistics out of Lonetrek.', url: '',
      });
    const table: Record<string, () => unknown> = {
      [`${corp}/members`]: () => MEMBERS.map((m) => m.id),
      [`${corp}/roles`]: roles,
      [`${corp}/membertracking`]: tracking,
      [`${corp}/titles`]: () => TITLES,
      [`${corp}/members/titles`]: () => MEMBERS.map((m) => ({ character_id: m.id, titles: [m.title] })),
      [`${corp}/roles/history`]: () => ROLE_HISTORY,
      [`${corp}/structures`]: structures,
      [`/corporation/${CORP_ID}/mining/extractions`]: extractions,
      [`${corp}/industry/jobs`]: jobs,
      [`${corp}/wallets`]: () => WALLETS,
      [`${corp}/divisions`]: () => ({
        hangar: [1, 2, 3, 4, 5, 6, 7].map((division) => ({ division, name: ['Moon Goo', 'Ore', 'Ships', 'Minerals', 'Blueprints', 'Loot', 'Misc'][division - 1] })),
        wallet: [1, 2, 3, 4, 5, 6, 7].map((division) => ({ division, name: ['Master Wallet', 'Moon Tax', 'Fuel', 'SRP', 'Buyback', 'Ops', 'Spare'][division - 1] })),
      }),
      [`/corporation/${CORP_ID}/mining/observers`]: () => STRUCTURES.filter((st) => st.refinery).map((st) => ({ observer_id: st.id, observer_type: 'structure', last_updated: iso(-6 * HOUR).slice(0, 10) })),
      [`${corp}/structures/skyhooks`]: () => [],
      [`${corp}/structures/sovereignty-hubs`]: () => [],
      [`${corp}/starbases`]: () => [],
      [`${corp}/customs_offices`]: () => [],
      [`${corp}/orders`]: () => [],
      [`${corp}/assets`]: assets,
      [`${corp}/contracts`]: () => [],
      [`${corp}/blueprints`]: () => [],
    };
    const handler = table[path];
    if (handler) return json(handler());
    if (/^\/corporations\/\d+\/wallets\/\d+\/transactions$/.test(path)) return json([]);
    if (/^\/corporation\/\d+\/mining\/observers\/\d+$/.test(path)) return json([]);
    const walletJournal = /^\/corporations\/\d+\/wallets\/(\d+)\/journal$/.exec(path);
    if (walletJournal) return json(walletJournal[1] === '1' ? journal() : []);
    const structure = /^\/universe\/structures\/(\d+)$/.exec(path);
    const known = structure && STRUCTURES.find((s) => s.id === Number(structure[1]));
    if (known) return json({ name: known.name, owner_id: CORP_ID, solar_system_id: known.systemId, type_id: known.typeId });
    const moon = /^\/universe\/moons\/(\d+)$/.exec(path);
    const moonS = moon && MOON_BY_ID.get(Number(moon[1]));
    if (moonS) return json({ moon_id: moonS.moonId, name: moonS.moonName, system_id: moonS.systemId });
    const system = /^\/universe\/systems\/(\d+)$/.exec(path);
    if (system && SYSTEM_ROWS.has(Number(system[1])))
      return json({ system_id: Number(system[1]), name: SYSTEM_ROWS.get(Number(system[1]))!.name, security_status: SYSTEM_SECURITY(Number(system[1])), constellation_id: 20000020, star_id: 1 });
    const lfcS2 = /^\/universe\/structures\/(\d+)$/.exec(path);
    const lfcK = lfcS2 && LFC_STRUCTURES.find((x) => x.structure_id === Number(lfcS2[1]));
    if (lfcK) return json({ name: lfcK.name, owner_id: LFC_ID, solar_system_id: lfcK.system_id, type_id: lfcK.type_id });
    if (path === `/characters/90000001/roles`) return json({ roles: ['Director', 'Station_Manager', 'Accountant'] });
    return route.fallback();
  });
}
void SYSTEMS;
