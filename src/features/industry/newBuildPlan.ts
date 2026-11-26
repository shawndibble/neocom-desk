import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { EMPTY_RIG_FIT, FACILITY_PRESETS, resolveRigFit } from '@/engine/industry/types';
import type { FacilityKind, IndustryActivity } from '@/engine/industry/types';
import { hubNowFor, loadHubFor } from '@/features/market/hub';
import { pageHubEntry } from '@/features/market/pageHubs';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import {
  DEFAULT_ACTIVITY_FACILITY_DEFAULTS,
  type ActivityFacilityDefaults,
  type FacilityDefaults,
} from './facilityDefaults';

import type { BlueprintCatalogEntry } from './blueprintCatalog';

export function fallbackFacility(activity: IndustryActivity): FacilityKind {
  return activity === 'reaction' ? 'athanor' : 'npcStation';
}

function planLocation(plan: BuildPlanRecord): FacilityDefaults {
  return {
    facility: plan.facility,
    rigFit: resolveRigFit(plan),
    facilityTaxPct: plan.facilityTaxPct ?? null,
    security: plan.security,
    ...(plan.buildSystemId !== undefined && plan.buildSystemName !== undefined
      ? { buildSystemId: plan.buildSystemId, buildSystemName: plan.buildSystemName }
      : {}),
    ...(plan.buildLocationId !== undefined ? { buildLocationId: plan.buildLocationId } : {}),
    ...(plan.buildLocationName !== undefined ? { buildLocationName: plan.buildLocationName } : {}),
  };
}

export function startingLocation(
  activity: IndustryActivity,
  facilityDefaults: ActivityFacilityDefaults,
  defaultsFrom?: BuildPlanRecord | null
): FacilityDefaults {
  const forActivity = facilityDefaults[activity];
  const recordHosts = FACILITY_PRESETS[forActivity.facility].activity === activity;
  if (recordHosts && forActivity.setOnPlanPage) return forActivity;
  if (defaultsFrom != null && FACILITY_PRESETS[defaultsFrom.facility].activity === activity) {
    return planLocation(defaultsFrom);
  }
  return recordHosts
    ? forActivity
    : { facility: fallbackFacility(activity), rigFit: EMPTY_RIG_FIT, facilityTaxPct: null };
}

export function mostRecentlyUpdatedPlan(
  plans: readonly BuildPlanRecord[] | undefined
): BuildPlanRecord | null {
  if (!plans || plans.length === 0) return null;
  return plans.reduce((latest, p) => (p.updatedAt > latest.updatedAt ? p : latest));
}

export function newPlanHubId(defaultsFrom?: BuildPlanRecord | null): TradeHub['id'] {
  if (pageHubEntry('industry') === undefined && defaultsFrom) return defaultsFrom.hubId;
  return hubNowFor('industry');
}

export function newPlanHub(defaultsFrom?: BuildPlanRecord | null): TradeHub {
  return getTradeHub(newPlanHubId(defaultsFrom)) ?? DEFAULT_TRADE_HUB;
}

export async function loadNewPlanHubInputs(): Promise<void> {
  await loadHubFor('industry');
}

export interface NewBuildPlanOverrides {
  runs?: number;
  me?: number;
  te?: number;
  name?: string;
  assumedMe?: number;
  assumedTe?: number;
  buildGroupId?: string;
  buildHere?: number[];
  updatedAt?: number;
}

export function newBuildPlan(
  characterId: number,
  entry: BlueprintCatalogEntry,
  owned: CharacterBlueprint | null,
  defaultsFrom?: BuildPlanRecord | null,
  facilityDefaults: ActivityFacilityDefaults = DEFAULT_ACTIVITY_FACILITY_DEFAULTS,
  overrides: NewBuildPlanOverrides = {}
): BuildPlanRecord {
  const activity = entry.blueprint.activity;
  const location = startingLocation(activity, facilityDefaults, defaultsFrom);
  const assumedMe = overrides.assumedMe ?? 0;
  const assumedTe = overrides.assumedTe ?? 0;
  return {
    id: crypto.randomUUID(),
    characterId,
    name: overrides.name ?? entry.productName,
    blueprintTypeID: entry.blueprintTypeID,
    runs: overrides.runs ?? (owned !== null && owned.runs > 0 ? owned.runs : 1),
    me: overrides.me ?? owned?.material_efficiency ?? assumedMe,
    te: overrides.te ?? owned?.time_efficiency ?? assumedTe,
    facility: location.facility,
    rigFit: location.rigFit,
    security: location.security ?? 'highsec',
    hubId: newPlanHubId(defaultsFrom),
    ...(location.buildSystemId !== undefined && location.buildSystemName !== undefined
      ? { buildSystemId: location.buildSystemId, buildSystemName: location.buildSystemName }
      : {}),
    ...(location.facilityTaxPct != null ? { facilityTaxPct: location.facilityTaxPct } : {}),
    ...(defaultsFrom?.materialPriceBasis !== undefined
      ? { materialPriceBasis: defaultsFrom.materialPriceBasis }
      : {}),
    ...(location.buildLocationId !== undefined
      ? { buildLocationId: location.buildLocationId }
      : {}),
    ...(location.buildLocationName !== undefined
      ? { buildLocationName: location.buildLocationName }
      : {}),
    ...(overrides.buildGroupId !== undefined ? { buildGroupId: overrides.buildGroupId } : {}),
    ...(overrides.buildHere !== undefined ? { buildHere: overrides.buildHere } : {}),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}
