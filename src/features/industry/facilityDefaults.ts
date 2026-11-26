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
import {
  parseRememberedLocation,
  sameRememberedRecord,
  type RememberedLocationFields,
} from './rememberedLocation';
import {
  DEFAULT_REACTION_FACILITY_DEFAULTS,
  useReactionFacilityDefaults,
  type ReactionFacilityDefaults,
} from './reactionFacilityDefaults';
import { adoptRefineryDefaultAsReactionLocation } from './adoptRefineryDefault';

export const FACILITY_DEFAULTS_SETTING_KEY = 'sync.industryFacilityDefaults';

const LEGACY_FACILITY_DEFAULTS_SETTING_KEY = 'industryFacilityDefaults';

export interface FacilityDefaults extends RememberedLocationFields {
  facility: FacilityKind;
  rigFit: RigFit;
  facilityTaxPct: number | null;
}

export const DEFAULT_FACILITY_DEFAULTS: FacilityDefaults = {
  facility: 'npcStation',
  rigFit: EMPTY_RIG_FIT,
  facilityTaxPct: null,
};

const RIG_KINDS: readonly RigKind[] = ['none', 'meT1', 'meT2', 'teT1', 'teT2'];
const LEGACY_RIG_LEVELS: readonly RigLevel[] = ['none', 't1', 't2'];

export function normalizeFacilityDefaults(value: FacilityDefaults): FacilityDefaults {
  if (FACILITY_PRESETS[value.facility].activity !== 'manufacturing') {
    return DEFAULT_FACILITY_DEFAULTS;
  }
  if (FACILITY_PRESETS[value.facility].structure) return value;
  return { ...value, rigFit: EMPTY_RIG_FIT, facilityTaxPct: null };
}

export interface ActivityFacilityDefaults {
  manufacturing: FacilityDefaults;
  reaction: ReactionFacilityDefaults;
}

export const DEFAULT_ACTIVITY_FACILITY_DEFAULTS: ActivityFacilityDefaults = {
  manufacturing: DEFAULT_FACILITY_DEFAULTS,
  reaction: DEFAULT_REACTION_FACILITY_DEFAULTS,
};

function parseFacilityDefaults(raw: unknown): FacilityDefaults | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown> & {
    facility?: unknown;
    rigFit?: unknown;
    rigLevel?: unknown;
    facilityTaxPct?: unknown;
  };
  if (typeof record.facility !== 'string' || !(record.facility in FACILITY_PRESETS)) return null;
  const hasRigFit =
    record.rigFit === undefined ||
    (Array.isArray(record.rigFit) && record.rigFit.every((k) => RIG_KINDS.includes(k as RigKind)));
  const hasRigLevel =
    record.rigLevel === undefined ||
    (typeof record.rigLevel === 'string' &&
      LEGACY_RIG_LEVELS.includes(record.rigLevel as RigLevel));
  if (!hasRigFit || !hasRigLevel) return null;
  const tax = record.facilityTaxPct;
  if (
    tax !== null &&
    tax !== undefined &&
    (typeof tax !== 'number' || !Number.isFinite(tax) || tax < 0)
  )
    return null;
  return normalizeFacilityDefaults({
    ...parseRememberedLocation(record),
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

let adoption: Promise<void> | null = null;

export async function hydrateActivityFacilityDefaults(): Promise<void> {
  adoption ??= adoptRefineryDefaultAsReactionLocation();
  await adoption;
  await Promise.all([
    useFacilityDefaults.getState().hydrate(),
    useReactionFacilityDefaults.getState().hydrate(),
  ]);
}

export async function loadActivityFacilityDefaults(): Promise<ActivityFacilityDefaults> {
  await hydrateActivityFacilityDefaults();
  return {
    manufacturing: useFacilityDefaults.getState().value,
    reaction: useReactionFacilityDefaults.getState().value,
  };
}

export async function rememberActivityLocations(next: {
  manufacturing?: FacilityDefaults;
  reaction?: ReactionFacilityDefaults;
}): Promise<void> {
  await hydrateActivityFacilityDefaults();
  const writes: Promise<void>[] = [];
  const manufacturing = useFacilityDefaults.getState();
  if (next.manufacturing && !sameRememberedRecord(manufacturing.value, next.manufacturing)) {
    writes.push(manufacturing.setValue(next.manufacturing));
  }
  const reaction = useReactionFacilityDefaults.getState();
  if (next.reaction && !sameRememberedRecord(reaction.value, next.reaction)) {
    writes.push(reaction.setValue(next.reaction));
  }
  await Promise.all(writes);
}
