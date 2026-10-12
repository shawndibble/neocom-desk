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
import { costIndexMemoryKey } from './costIndexOverride';

const SETTING_KEY = 'industry.facilityMemory';

export interface FacilityMemory {
  rigFit?: RigFit;
  facilityTaxPct?: number;
  /** In-game percent, as typed — see `costIndexOverride.ts`. */
  costIndexPct?: number;
}

type Place = Pick<BuildPlanRecord, 'buildLocationId' | 'buildSystemId'>;

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

export async function recallFacility(place: Place): Promise<FacilityMemory | null> {
  const key = costIndexMemoryKey(place);
  if (key === null) return null;
  return (await readAll())[key] ?? null;
}

export async function rememberFacility(place: Place, memory: FacilityMemory): Promise<void> {
  const key = costIndexMemoryKey(place);
  if (key === null) return;
  const all = await readAll();
  await db.settings.put({ key: SETTING_KEY, value: { ...all, [key]: { ...all[key], ...memory } } });
}

export async function forgetFacility(place: Place, field: keyof FacilityMemory): Promise<void> {
  const key = costIndexMemoryKey(place);
  if (key === null) return;
  const all = await readAll();
  if (!all[key]) return;
  const rest = { ...all[key] };
  delete rest[field];
  await db.settings.put({ key: SETTING_KEY, value: { ...all, [key]: rest } });
}
