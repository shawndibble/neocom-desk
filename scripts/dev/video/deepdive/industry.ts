/** Industry jobs, blueprints and the mining ledger. Mira is the industrialist; Arden runs a couple of ammo jobs. */
import { DAY_MS, HOUR_MS } from '../../../../src/lib/age';
import { utcDay } from '../../../../src/engine/localDay';
import { mix } from '../../sandbox/gen';
import { ARDEN, MIRA, STATIONS, SYSTEMS } from './cast';
import { T } from './catalog';

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

/** [blueprint type, product type, runs, hours left (negative = finished that long ago), status, station] */
type JobSpec = [number, number, number, number, 'active' | 'ready' | 'delivered', number];
const MIRA_JOBS: JobSpec[] = [
  [24703, T.hurricane, 4, 21, 'active', STATIONS.tunttaras],
  [24703, T.hurricane, 4, 47, 'active', STATIONS.tunttaras],
  [691, T.rifter, 10, 6.5, 'active', STATIONS.tunttaras],
  [17479, T.retriever, 3, 30, 'active', STATIONS.nourvukaiken],
  [3842, T.largeShieldExtenderII, 5, 12, 'active', STATIONS.nourvukaiken],
  [2739, T.nanitePaste, 20, -3, 'ready', STATIONS.tunttaras],
  [11288, T.capBooster400, 40, -9, 'ready', STATIONS.tunttaras],
  [2467, T.hornetII, 30, -50, 'delivered', STATIONS.tunttaras],
  [1406, T.inertialStabilizersII, 12, -76, 'delivered', STATIONS.nourvukaiken],
  [24703, T.hurricane, 4, -120, 'delivered', STATIONS.tunttaras],
];
const ARDEN_JOBS: JobSpec[] = [
  [2630, T.scourgeFury, 30, 14, 'active', STATIONS.nourvukaiken],
  [2457, T.hobgoblinII, 20, -20, 'delivered', STATIONS.nourvukaiken],
];

function jobs(specs: JobSpec[], base: number) {
  return specs.map(([bp, product, runs, hours, status, station], index) => ({
    job_id: base + index,
    activity_id: 1,
    blueprint_id: 2_100_000_000 + base + index,
    blueprint_type_id: bp,
    facility_id: station,
    station_id: station,
    output_location_id: station,
    runs,
    start_date: iso((hours - 30 - runs) * HOUR_MS),
    end_date: iso(hours * HOUR_MS),
    status,
    cost: 220_000 + mix(index + base) * 2_100,
    licensed_runs: 10,
    product_type_id: product,
  }));
}

export function industryJobs(characterId: number) {
  if (characterId === MIRA.id) return jobs(MIRA_JOBS, 800_000);
  if (characterId === ARDEN.id) return jobs(ARDEN_JOBS, 810_000);
  return [];
}

export function blueprints(characterId: number) {
  if (characterId !== MIRA.id && characterId !== ARDEN.id) return [];
  const own: [number, number, number, number][] =
    characterId === MIRA.id
      ? [
          [24703, -1, 10, 20],
          [691, -1, 10, 20],
          [17479, -1, 8, 16],
          [3842, -1, 10, 20],
          [2739, -1, 10, 20],
          [11288, -1, 9, 18],
          [2467, -1, 10, 20],
          [1406, -2, 10, 20],
          [24699, -2, 7, 14],
          [17716, -2, 5, 10],
        ]
      : [
          [2630, -1, 8, 16],
          [2457, -1, 6, 12],
        ];
  return own.map(([type, runs, me, te], index) => ({
    item_id: 3_000_000_000 + characterId * 10 + index,
    type_id: type,
    runs: runs === -1 ? -1 : 10 + index,
    material_efficiency: me,
    time_efficiency: te,
    quantity: runs === -1 ? -1 : -2,
    location_id: STATIONS.tunttaras,
    location_flag: 'Hangar',
  }));
}

/** Mira mines most evenings in Lonetrek's belts. */
export function mining(characterId: number) {
  if (characterId !== MIRA.id) return [];
  const rows: unknown[] = [];
  const systems = [SYSTEMS.nourvukaiken, SYSTEMS.tunttaras, SYSTEMS.sarekuwa];
  for (let back = 0; back < 26; back += 1) {
    if (back % 5 === 4) continue;
    [T.veldspar, T.scordite, T.pyroxeres, T.plagioclase].forEach((typeId, index) => {
      if ((back + index) % 3 === 2) return;
      rows.push({
        date: utcDay(Date.now() - back * DAY_MS),
        quantity: 14_000 + mix(back * 7 + index) * 40,
        solar_system_id: systems[(back + index) % systems.length],
        type_id: typeId,
      });
    });
  }
  return rows;
}
