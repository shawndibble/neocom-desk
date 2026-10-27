/**
 * The place half of a remembered facility default: security band, build
 * system and the station or structure the pilot picked. Shared by the
 * manufacturing and reaction records (`facilityDefaults.ts`,
 * `reactionFacilityDefaults.ts`), which hold the same fields a Build Plan's
 * primary location does, under the same names.
 *
 * Every field is optional, and absent rather than `undefined` when unset: a
 * record written before locations were remembered carries none of them, and
 * the record syncs through Firestore, which rejects `undefined` at any depth.
 */
import type { SecurityBand } from '@/engine/industry/types';

export interface RememberedLocationFields {
  security?: SecurityBand;
  /** Always held with `buildSystemName` or not at all — see `BuildPlanRecord.buildSystemName`. */
  buildSystemId?: number;
  /** @see buildSystemId */
  buildSystemName?: string;
  buildLocationId?: number;
  /** Only with `buildLocationId`; the id alone is still a place (ESI withholds some names). */
  buildLocationName?: string;
  /**
   * Present (always `true`) only on a record a Build Plan page wrote. One
   * without it is a Settings-era record or the untouched default, and
   * `newBuildPlan` still prefers the most recent plan's location over it —
   * so the update does not drop a pilot's long-used Azbel back to an NPC
   * station before they have set anything under the new rule.
   */
  setOnPlanPage?: true;
}

const SECURITY_BANDS: readonly SecurityBand[] = ['highsec', 'lowsec', 'nullsec'];

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/**
 * Reads the location fields off a stored record, field by field. A malformed
 * one is dropped on its own rather than failing the record: the facility, rig
 * and tax beside it are still the pilot's answer, and a pulled value from an
 * older or newer build should cost as little of it as possible.
 */
export function parseRememberedLocation(raw: Record<string, unknown>): RememberedLocationFields {
  const fields: RememberedLocationFields = {};
  if (SECURITY_BANDS.includes(raw.security as SecurityBand)) {
    fields.security = raw.security as SecurityBand;
  }
  if (isId(raw.buildSystemId) && isName(raw.buildSystemName)) {
    fields.buildSystemId = raw.buildSystemId;
    fields.buildSystemName = raw.buildSystemName;
  }
  if (isId(raw.buildLocationId)) {
    fields.buildLocationId = raw.buildLocationId;
    if (isName(raw.buildLocationName)) fields.buildLocationName = raw.buildLocationName;
  }
  if (raw.setOnPlanPage === true) fields.setOnPlanPage = true;
  return fields;
}

/** Sorted-key JSON, so two records built in a different key order compare equal. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

/**
 * Whether two remembered records hold the same thing. A plan-page edit that
 * lands on the location already remembered — a rig re-picked to what it was —
 * skips the write: each one pushes to Firestore, schedules a sync for every
 * Character and re-prices Opportunities.
 */
export function sameRememberedRecord(a: object, b: object): boolean {
  return stableJson(a) === stableJson(b);
}
