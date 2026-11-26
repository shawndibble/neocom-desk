import { createSyncedSetting } from '@/lib/useSyncedSetting';
import {
  EMPTY_RIG_FIT,
  FACILITY_PRESETS,
  resolveRigFit,
  type FacilityKind,
  type RigFit,
  type RigKind,
} from '@/engine/industry/types';
import { parseRememberedLocation, type RememberedLocationFields } from './rememberedLocation';

export const REACTION_FACILITY_DEFAULTS_SETTING_KEY = 'sync.industryReactionFacilityDefaults';

export interface ReactionFacilityDefaults extends RememberedLocationFields {
  facility: FacilityKind;
  rigFit: RigFit;
  facilityTaxPct: number | null;
}

export const DEFAULT_REACTION_FACILITY_DEFAULTS: ReactionFacilityDefaults = {
  facility: 'athanor',
  rigFit: EMPTY_RIG_FIT,
  facilityTaxPct: null,
};

const RIG_KINDS: readonly RigKind[] = ['none', 'meT1', 'meT2', 'teT1', 'teT2'];

export const REACTION_FACILITY_PRESETS = Object.values(FACILITY_PRESETS).filter(
  (preset) => preset.activity === 'reaction'
);

export function normalizeReactionFacilityDefaults(
  value: ReactionFacilityDefaults
): ReactionFacilityDefaults {
  if (FACILITY_PRESETS[value.facility].activity === 'reaction') return value;
  return DEFAULT_REACTION_FACILITY_DEFAULTS;
}

function parseReactionFacilityDefaults(raw: unknown): ReactionFacilityDefaults | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown> & {
    facility?: unknown;
    rigFit?: unknown;
    facilityTaxPct?: unknown;
  };
  if (typeof record.facility !== 'string' || !(record.facility in FACILITY_PRESETS)) return null;
  const hasRigFit =
    record.rigFit === undefined ||
    (Array.isArray(record.rigFit) && record.rigFit.every((k) => RIG_KINDS.includes(k as RigKind)));
  if (!hasRigFit) return null;
  const tax = record.facilityTaxPct;
  if (
    tax !== null &&
    tax !== undefined &&
    (typeof tax !== 'number' || !Number.isFinite(tax) || tax < 0)
  )
    return null;
  return normalizeReactionFacilityDefaults({
    ...parseRememberedLocation(record),
    facility: record.facility as FacilityKind,
    rigFit: resolveRigFit({ rigFit: record.rigFit as RigKind[] | undefined }),
    facilityTaxPct: (tax as number | null | undefined) ?? null,
  });
}

export const useReactionFacilityDefaults = createSyncedSetting<ReactionFacilityDefaults>({
  key: REACTION_FACILITY_DEFAULTS_SETTING_KEY,
  defaultValue: DEFAULT_REACTION_FACILITY_DEFAULTS,
  parse: parseReactionFacilityDefaults,
});
