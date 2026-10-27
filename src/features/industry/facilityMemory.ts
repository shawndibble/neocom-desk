/**
 * What a pilot has told the app about one facility: its rigs, the tax its
 * owner charges and — for a J-Space structure ESI has no cost index for — the
 * index they read in the industry window. Filed per facility (the station or
 * structure, else its system) so setting it once serves every plan that builds
 * there, instead of once per plan.
 *
 * Local only, in the `settings` table under an unsynced key: it is a cache of
 * the pilot's own answers, and a miss costs one retype. Recalled when a plan
 * picks the facility (`BuildPlanDetail`), never pushed onto a plan that has
 * already been set.
 */
import { db, type BuildPlanRecord } from '@/db';
import {
  FACILITY_PRESETS,
  resolveRigFit,
  type FacilityKind,
  type RigFit,
} from '@/engine/industry/types';

const SETTING_KEY = 'industry.facilityMemory';

export interface FacilityMemory {
  rigFit?: RigFit;
  facilityTaxPct?: number;
  /** In-game percent, as typed — see `costIndexOverride.ts`. */
  costIndexPct?: number;
}

type Place = Pick<BuildPlanRecord, 'buildLocationId' | 'buildSystemId'>;

/** Where a facility is filed: the picked station or structure, else its system. */
export function facilityMemoryKey(place: Place): string | null {
  if (place.buildLocationId !== undefined) return `loc:${place.buildLocationId}`;
  if (place.buildSystemId !== undefined) return `sys:${place.buildSystemId}`;
  return null;
}

/**
 * Writes run one after another: each is a read-modify-write of one row, and two
 * in flight would drop each other's fields (or let a recall read a row a clear
 * has not yet written).
 */
let writes: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = writes.then(job, job);
  writes = run.catch(() => undefined);
  return run;
}

export function memoryFromPlan(
  plan: Pick<BuildPlanRecord, 'facility' | 'rigFit' | 'rigLevel' | 'facilityTaxPct'> &
    Partial<Pick<BuildPlanRecord, 'costIndexOverridePct'>>
): FacilityMemory {
  const memory: FacilityMemory = {};
  // An NPC station has no rig slots and a tax CCP fixes, so neither belongs to it.
  if (FACILITY_PRESETS[plan.facility].structure) {
    memory.rigFit = resolveRigFit(plan);
    if (plan.facilityTaxPct !== undefined) memory.facilityTaxPct = plan.facilityTaxPct;
  }
  if (plan.costIndexOverridePct !== undefined) memory.costIndexPct = plan.costIndexOverridePct;
  return memory;
}

export function patchFromMemory(
  memory: FacilityMemory,
  facility: FacilityKind
): Partial<BuildPlanRecord> {
  const patch: Partial<BuildPlanRecord> = {};
  if (FACILITY_PRESETS[facility].structure) {
    if (memory.rigFit !== undefined) patch.rigFit = memory.rigFit;
    if (memory.facilityTaxPct !== undefined) patch.facilityTaxPct = memory.facilityTaxPct;
  }
  if (memory.costIndexPct !== undefined) patch.costIndexOverridePct = memory.costIndexPct;
  return patch;
}

async function readAll(): Promise<Record<string, FacilityMemory>> {
  const row = await db.settings.get(SETTING_KEY);
  const value = row?.value;
  return value && typeof value === 'object' ? (value as Record<string, FacilityMemory>) : {};
}

export function recallFacility(place: Place): Promise<FacilityMemory | null> {
  const key = facilityMemoryKey(place);
  if (key === null) return Promise.resolve(null);
  return enqueue(async () => (await readAll())[key] ?? null);
}

export function rememberFacility(place: Place, memory: FacilityMemory): Promise<void> {
  const key = facilityMemoryKey(place);
  if (key === null) return Promise.resolve();
  return enqueue(async () => {
    const all = await readAll();
    await db.settings.put({
      key: SETTING_KEY,
      value: { ...all, [key]: { ...all[key], ...memory } },
    });
  });
}

export function forgetFacility(place: Place, field: keyof FacilityMemory): Promise<void> {
  const key = facilityMemoryKey(place);
  if (key === null) return Promise.resolve();
  return enqueue(() => forget(key, field));
}

async function forget(key: string, field: keyof FacilityMemory): Promise<void> {
  const all = await readAll();
  if (!all[key]) return;
  const rest = { ...all[key] };
  delete rest[field];
  await db.settings.put({ key: SETTING_KEY, value: { ...all, [key]: rest } });
}
