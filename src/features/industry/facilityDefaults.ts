/**
 * What a brand-new Build Plan starts at when there is no earlier plan to copy
 * from.
 *
 * `newBuildPlan` already carries facility, rig, security, hub, tax and build
 * system forward from the character's most recently updated plan (issue #456),
 * so this is only consulted for a character's *first* plan — and for one whose
 * previous plan hosts a different activity, where carrying the facility
 * forward would name a structure the new blueprint cannot run at.
 *
 * That is a narrow window, but it is the one where the pilot has told the app
 * nothing and the app has to guess. An industrialist who owns a rigged Azbel
 * builds there; guessing NPC station quotes their first plan against a
 * facility they never use, and every plan after inherits it.
 *
 * One packed record rather than three keys: rig level and facility tax only
 * mean anything for a player structure, and splitting them lets the three
 * drift into a combination the pilot never chose.
 *
 * Synced across the pilot's devices — the Azbel they build at is theirs, not
 * their laptop's. The packing has one cost there, named in the decision that
 * introduced it: `mergeSettings` is last-write-wins per *key*, so two devices
 * that change different fields of this record before either syncs keep only
 * the later record whole, rather than merging the two fields.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import {
  EMPTY_RIG_FIT,
  FACILITY_PRESETS,
  resolveRigFit,
  type FacilityKind,
  type RigFit,
  type RigKind,
  type RigLevel,
} from '@/engine/industry/types';

export const FACILITY_DEFAULTS_SETTING_KEY = 'sync.industryFacilityDefaults';

/** What it was stored under before it synced; its value is adopted once. */
export const LEGACY_FACILITY_DEFAULTS_SETTING_KEY = 'industryFacilityDefaults';

export interface FacilityDefaults {
  facility: FacilityKind;
  /** Only meaningful for a player structure; forced to all-none otherwise (issue #609). */
  rigFit: RigFit;
  /**
   * Owner-set facility tax, percent of EIV. `null` rather than absent so the
   * stored record has one shape; means "use the preset's own default", which
   * is what a plan with no `facilityTaxPct` does today.
   */
  facilityTaxPct: number | null;
}

/** Today's hardcoded behaviour, so an existing pilot's first plan is unchanged. */
export const DEFAULT_FACILITY_DEFAULTS: FacilityDefaults = {
  facility: 'npcStation',
  rigFit: EMPTY_RIG_FIT,
  facilityTaxPct: null,
};

const RIG_KINDS: readonly RigKind[] = ['none', 'meT1', 'meT2', 'teT1', 'teT2'];
const LEGACY_RIG_LEVELS: readonly RigLevel[] = ['none', 't1', 't2'];

/**
 * An NPC station fits no rigs and its tax is fixed, so a stored record that
 * says otherwise is incoherent rather than merely unusual. Normalised on read
 * instead of rejected: the facility is the part the pilot chose, and dropping
 * it over a stale rig fit would be the more surprising outcome.
 *
 * This is the same rule `BuildPlanDetail` applies when the pilot switches a
 * plan away from a structure — one place would be better, but that one is a
 * form handler over a plan record and this is a stored preference.
 */
export function normalizeFacilityDefaults(value: FacilityDefaults): FacilityDefaults {
  if (FACILITY_PRESETS[value.facility].structure) return value;
  return { facility: value.facility, rigFit: EMPTY_RIG_FIT, facilityTaxPct: null };
}

function parseFacilityDefaults(raw: unknown): FacilityDefaults | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as {
    facility?: unknown;
    rigFit?: unknown;
    rigLevel?: unknown;
    facilityTaxPct?: unknown;
  };
  if (typeof record.facility !== 'string' || !(record.facility in FACILITY_PRESETS)) return null;
  // A record from before issue #609 carries only `rigLevel`; one written
  // since carries `rigFit`. Either shape, or neither (a record from before
  // rigs were stored at all), resolves through the same migration `BuildPlan`
  // records use, so this setting and a plan never disagree about what an old
  // record meant.
  const hasRigFit =
    record.rigFit === undefined ||
    (Array.isArray(record.rigFit) && record.rigFit.every((k) => RIG_KINDS.includes(k as RigKind)));
  const hasRigLevel =
    record.rigLevel === undefined ||
    (typeof record.rigLevel === 'string' &&
      LEGACY_RIG_LEVELS.includes(record.rigLevel as RigLevel));
  if (!hasRigFit || !hasRigLevel) return null;
  // Absent and `null` both mean "use the preset's own default" — a record
  // written before this field existed must not be thrown away over it.
  const tax = record.facilityTaxPct;
  if (
    tax !== null &&
    tax !== undefined &&
    (typeof tax !== 'number' || !Number.isFinite(tax) || tax < 0)
  )
    return null;
  return normalizeFacilityDefaults({
    facility: record.facility as FacilityKind,
    rigFit: resolveRigFit({
      rigFit: record.rigFit as RigKind[] | undefined,
      rigLevel: record.rigLevel as RigLevel | undefined,
    }),
    facilityTaxPct: (tax as number | null | undefined) ?? null,
  });
}

export const useFacilityDefaults = createSyncedSetting<FacilityDefaults>({
  key: FACILITY_DEFAULTS_SETTING_KEY,
  legacyKey: LEGACY_FACILITY_DEFAULTS_SETTING_KEY,
  defaultValue: DEFAULT_FACILITY_DEFAULTS,
  parse: parseFacilityDefaults,
});
