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
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { FACILITY_PRESETS, type FacilityKind, type RigLevel } from '@/engine/industry/types';

export const FACILITY_DEFAULTS_SETTING_KEY = 'industryFacilityDefaults';

export interface FacilityDefaults {
  facility: FacilityKind;
  /** Only meaningful for a player structure; forced to 'none' otherwise. */
  rigLevel: RigLevel;
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
  rigLevel: 'none',
  facilityTaxPct: null,
};

const RIG_LEVELS: readonly RigLevel[] = ['none', 't1', 't2'];

/**
 * An NPC station fits no rigs and its tax is fixed, so a stored record that
 * says otherwise is incoherent rather than merely unusual. Normalised on read
 * instead of rejected: the facility is the part the pilot chose, and dropping
 * it over a stale rig level would be the more surprising outcome.
 *
 * This is the same rule `BuildPlanDetail` applies when the pilot switches a
 * plan away from a structure — one place would be better, but that one is a
 * form handler over a plan record and this is a stored preference.
 */
export function normalizeFacilityDefaults(value: FacilityDefaults): FacilityDefaults {
  if (FACILITY_PRESETS[value.facility].structure) return value;
  return { facility: value.facility, rigLevel: 'none', facilityTaxPct: null };
}

function parseFacilityDefaults(raw: unknown): FacilityDefaults | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Partial<FacilityDefaults>;
  if (typeof record.facility !== 'string' || !(record.facility in FACILITY_PRESETS)) return null;
  if (typeof record.rigLevel !== 'string' || !RIG_LEVELS.includes(record.rigLevel)) return null;
  // Absent and `null` both mean "use the preset's own default" — a record
  // written before this field existed must not be thrown away over it.
  const tax = record.facilityTaxPct;
  if (tax !== null && tax !== undefined && (!Number.isFinite(tax) || tax < 0)) return null;
  return normalizeFacilityDefaults({
    facility: record.facility,
    rigLevel: record.rigLevel,
    facilityTaxPct: tax ?? null,
  });
}

export const useFacilityDefaults = createLocalSetting<FacilityDefaults>({
  key: FACILITY_DEFAULTS_SETTING_KEY,
  defaultValue: DEFAULT_FACILITY_DEFAULTS,
  parse: parseFacilityDefaults,
});
