import { CHARACTER_ID, CORPORATION_ID } from '../../../e2e/support/fixtureData';
import { DAY_MS, HOUR_MS } from '../../../src/lib/age';
import { iso, mix } from './gen';
import playerGroups from './playerGroups.json' with { type: 'json' };

interface FixtureMember {
  id: number;
  name: string;
  hoursAgo: number | null;
  shipTypeId: number | null;
  locationId: number | null;
  joined: string;
  roles: string[];
}
const FIXTURE: FixtureMember[] = playerGroups.corp;
const FIXTURE_BY_ID = new Map(FIXTURE.map((f) => [f.id, f]));

const SYSTEMS = [30002187, 30002053, 30000144];
const STATIONS = [60003760, 60008494];
const SHIPS = [587, 24698, 638, 16240, 22544, 17476, 28606];

export const STRUCTURES = [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: 1_040_000_000_001 + i,
    name: `Dev ${i % 2 === 0 ? 'Athanor' : 'Tatara'} ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'][i]}`,
    typeId: i % 2 === 0 ? 35835 : 35836,
    systemId: SYSTEMS[i % 3],
    refinery: true,
  })),
  {
    id: 1_040_000_000_101,
    name: 'Dev Fortizar Home',
    typeId: 35833,
    systemId: 30002187,
    refinery: false,
  },
  {
    id: 1_040_000_000_102,
    name: 'Dev Raitaru Works',
    typeId: 35825,
    systemId: 30002053,
    refinery: false,
  },
];

const MEMBER_IDS = [
  CHARACTER_ID,
  90_000_002,
  90_000_003,
  ...Array.from({ length: 12 }, (_, i) => 90_001_000 + i),
  ...Array.from({ length: 10 }, (_, i) => 91_000_000 + i),
  ...FIXTURE.map((f) => f.id).filter((id) => id !== CHARACTER_ID),
];

const ROLE_SETS: string[][] = [
  ['Director', 'Station_Manager', 'Accountant'],
  ['Accountant', 'Junior_Accountant'],
  ['Station_Manager', 'Config_Equipment'],
  ['Hangar_Take_1', 'Hangar_Query_1'],
  [],
];

function roles() {
  return MEMBER_IDS.map((id, i) => {
    const fixture = FIXTURE_BY_ID.get(id);
    if (fixture)
      return {
        character_id: id,
        roles: fixture.roles,
        grantable_roles: fixture.roles.includes('Director') ? ['Director'] : [],
      };
    return {
      character_id: id,
      roles: ROLE_SETS[i === 0 ? 0 : 1 + ((i - 1) % (ROLE_SETS.length - 1))],
      grantable_roles: i === 0 ? ['Director'] : [],
    };
  });
}

function memberTracking() {
  return MEMBER_IDS.map((id, i) => {
    const fixture = FIXTURE_BY_ID.get(id);
    if (fixture) {
      return {
        character_id: id,
        start_date: new Date(`${fixture.joined}T00:00:00Z`).toISOString(),
        ...(fixture.hoursAgo === null
          ? {}
          : {
              location_id: fixture.locationId,
              ship_type_id: fixture.shipTypeId,
              logon_date: iso(-fixture.hoursAgo * HOUR_MS),
              logoff_date: iso(-(fixture.hoursAgo + 0.5) * HOUR_MS),
            }),
      };
    }
    return {
      character_id: id,
      location_id: STATIONS[i % 2],
      ship_type_id: SHIPS[i % SHIPS.length],
      start_date: iso(-(200 + i * 13) * DAY_MS),
      logon_date: iso(-(i * 7 + 1) * HOUR_MS),
      logoff_date: iso(-(i * 7 + 3) * HOUR_MS),
    };
  });
}

const TITLES = [
  { title_id: 1, name: 'Director', roles: ['Director'] },
  { title_id: 2, name: 'Miner', roles: [] },
  { title_id: 4, name: 'Hauler', roles: ['Hangar_Take_1'] },
];

function memberTitles() {
  return MEMBER_IDS.map((id, i) => ({
    character_id: id,
    titles: [i === 0 ? 1 : i % 3 === 0 ? 4 : 2],
  }));
}

function structures() {
  return STRUCTURES.map((s, i) => ({
    structure_id: s.id,
    corporation_id: CORPORATION_ID,
    system_id: s.systemId,
    type_id: s.typeId,
    profile_id: 1,
    name: s.name,
    fuel_expires: iso((i === 3 ? 1 : 4 + i * 6) * DAY_MS),
    reinforce_hour: 18,
    state: i === 5 ? 'shield_vulnerable' : 'shield_vulnerable',
    services: s.refinery
      ? [
          { name: 'Moon Drilling', state: i === 4 ? 'offline' : 'online' },
          { name: 'Reprocessing', state: 'online' },
        ]
      : [
          { name: 'Market', state: 'online' },
          { name: 'Manufacturing (Standard)', state: 'online' },
        ],
  }));
}

const DIVISIONS = {
  hangar: [1, 2, 3, 4, 5, 6, 7].map((division) => ({
    division,
    name: ['Moon Goo', 'Ore', 'Ships', 'Minerals', 'Blueprints', 'Loot', 'Misc'][division - 1],
  })),
  wallet: [1, 2, 3, 4, 5, 6, 7].map((division) => ({
    division,
    name: ['Master Wallet', 'Moon Tax', 'Fuel', 'SRP', 'Buyback', 'Ops', 'Spare'][division - 1],
  })),
};

const wallets = () =>
  [1, 2, 3, 4, 5, 6, 7].map((division) => ({
    division,
    balance:
      division === 1
        ? 5_000_000_000
        : division === 2
          ? 1_250_000_000
          : division === 4
            ? 310_000_000
            : 0,
  }));

function walletJournal() {
  return Array.from({ length: 24 }, (_, i) => ({
    id: 900_001 + i,
    date: iso(-(i + 1) * DAY_MS),
    ref_type: 'player_donation',
    amount: 1_000_000 * (i + 1),
    balance: 5_000_000_000 + i,
    first_party_id: 90_000_002 + (i % 4),
    second_party_id: CORPORATION_ID,
    description: 'moon tax',
    reason: 'moon tax',
  }));
}

const ASSET_TYPES = [34, 35, 36, 37, 38, 40, 45490, 45491, 45492, 16240, 22544, 28606];

function assets() {
  let id = 3_000_000_000;
  const rows: unknown[] = [];
  for (const [s, station] of STATIONS.entries()) {
    for (const [i, typeId] of ASSET_TYPES.entries()) {
      rows.push({
        item_id: id++,
        type_id: typeId,
        quantity:
          typeId >= 16000 && typeId < 30000 && typeId !== 45490 ? 1 : 2_000 + mix(typeId + s) * 600,
        location_id: station,
        location_type: 'station',
        location_flag: `CorpSAG${(i % 4) + 1}`,
        is_singleton: typeId >= 16000 && typeId < 30000 && typeId < 40000,
      });
    }
  }
  for (const [i, s] of STRUCTURES.entries()) {
    for (const [k, typeId] of [34, 35, 45490].entries()) {
      rows.push({
        item_id: id++,
        type_id: typeId,
        quantity: 800 + mix(i * 7 + k) * 40,
        location_id: s.id,
        location_type: 'other',
        location_flag: 'CorpSAG1',
        is_singleton: false,
      });
    }
  }
  return rows;
}

const BLUEPRINTS: [number, number][] = [
  [24699, 24698],
  [22545, 22544],
];

function industryJobs() {
  const statuses = ['active', 'ready', 'delivered', 'active'] as const;
  return Array.from({ length: 10 }, (_, i) => {
    const [bp, product] = BLUEPRINTS[i % 2];
    const status = statuses[i % statuses.length];
    return {
      job_id: 800_000 + i,
      installer_id: MEMBER_IDS[i % 6],
      activity_id: 1,
      blueprint_id: 2_200_000_000 + i,
      blueprint_type_id: bp,
      blueprint_location_id: STATIONS[i % 2],
      output_location_id: STATIONS[i % 2],
      facility_id: STATIONS[i % 2],
      location_id: STATIONS[i % 2],
      runs: 2 + (i % 5),
      start_date: iso(-(i * 6 + 3) * HOUR_MS),
      end_date: iso(status === 'active' ? (i * 5 + 2) * HOUR_MS : -(i + 1) * HOUR_MS),
      status,
      cost: 400_000 + mix(i) * 8_000,
      licensed_runs: 10,
      product_type_id: product,
    };
  });
}

const CORP = `/corporations/${CORPORATION_ID}`;

const LISTS: Record<string, () => unknown> = {
  [`${CORP}/members`]: () => MEMBER_IDS,
  [`${CORP}/roles`]: roles,
  [`${CORP}/membertracking`]: memberTracking,
  [`${CORP}/titles`]: () => TITLES,
  [`${CORP}/members/titles`]: memberTitles,
  [`${CORP}/structures`]: structures,
  [`${CORP}/divisions`]: () => DIVISIONS,
  [`${CORP}/wallets`]: wallets,
  [`${CORP}/assets`]: assets,
  [`${CORP}/industry/jobs`]: industryJobs,
};

export function corpAnswer(path: string, method: string, body: unknown): unknown | undefined {
  const list = LISTS[path];
  if (list) return list();
  if (/^\/corporations\/\d+\/wallets\/\d+\/journal$/.test(path)) return walletJournal();
  if (/^\/corporations\/\d+\/wallets\/\d+\/transactions$/.test(path)) return [];
  if (method === 'POST' && path === `${CORP}/assets/names`) {
    return (body as number[]).map((item_id) => ({ item_id, name: `Container ${item_id % 1000}` }));
  }
  const structure = /^\/universe\/structures\/(\d+)$/.exec(path);
  const known = structure && STRUCTURES.find((s) => s.id === Number(structure[1]));
  if (known) {
    return {
      name: known.name,
      owner_id: CORPORATION_ID,
      solar_system_id: known.systemId,
      type_id: known.typeId,
    };
  }
  return undefined;
}
