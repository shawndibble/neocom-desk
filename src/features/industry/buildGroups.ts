import {
  FACILITY_PRESETS,
  type FacilityKind,
  type OwnedStockScope,
  type RigFit,
  type SecurityBand,
} from '@/engine/industry/types';
import { parseRigKind } from '@/engine/industry/rigScope';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import { coerceArrayEntry, parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';

export const SYNCED_BUILD_GROUPS_KEY = 'sync.industryBuildGroups';

export interface BuildGroupSnapshot {
  hubId: TradeHub['id'];
  facility: FacilityKind;
  security: SecurityBand;
  buildSystemId?: number;
  buildSystemName?: string;
  buildLocationId?: number;
  buildLocationName?: string;
  rigFit?: RigFit;
  facilityTaxPct?: number;
  appliedAt: number;
}

export interface BuildGroupAutoBuildDefault {
  strategy: BuildStrategy;
}

export interface BuildGroup {
  id: string;
  name: string;
  order: number;
  snapshot?: BuildGroupSnapshot;
  autoBuildDefault?: BuildGroupAutoBuildDefault;
  ownedStock?: Record<number, number>;
  ownedStockScope?: OwnedStockScope;
}

export type BuildGroupsValue = Record<number, BuildGroup[]>;

function usableSnapshot(value: unknown): value is BuildGroupSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const {
    hubId,
    facility,
    security,
    buildSystemId,
    buildSystemName,
    buildLocationId,
    buildLocationName,
    rigFit,
    facilityTaxPct,
    appliedAt,
  } = value as Partial<BuildGroupSnapshot>;
  return (
    typeof hubId === 'string' &&
    TRADE_HUBS.some((hub) => hub.id === hubId) &&
    typeof facility === 'string' &&
    facility in FACILITY_PRESETS &&
    (security === 'highsec' || security === 'lowsec' || security === 'nullsec') &&
    (buildSystemId === undefined) === (buildSystemName === undefined) &&
    (buildSystemId === undefined || typeof buildSystemId === 'number') &&
    (buildSystemName === undefined || typeof buildSystemName === 'string') &&
    (buildLocationId === undefined || Number.isFinite(buildLocationId)) &&
    (buildLocationName === undefined ||
      (typeof buildLocationName === 'string' && buildLocationId !== undefined)) &&
    (rigFit === undefined ||
      (Array.isArray(rigFit) &&
        rigFit.length === 3 &&
        rigFit.every((kind) => kind === 'none' || parseRigKind(kind) !== null))) &&
    (facilityTaxPct === undefined || Number.isFinite(facilityTaxPct)) &&
    typeof appliedAt === 'number' &&
    Number.isFinite(appliedAt)
  );
}

function usableAutoBuildDefault(value: unknown): value is BuildGroupAutoBuildDefault {
  if (typeof value !== 'object' || value === null) return false;
  const { strategy } = value as Partial<BuildGroupAutoBuildDefault>;
  return strategy === 'buy' || strategy === 'build' || strategy === 'cost-effective';
}

const LOCATION_TYPES = new Set(['station', 'solar_system', 'item', 'other']);

function usableOwnedStockLocation(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { characterId, locationId, locationType } = value as Record<string, unknown>;
  return (
    typeof characterId === 'number' &&
    Number.isFinite(characterId) &&
    typeof locationId === 'number' &&
    Number.isFinite(locationId) &&
    typeof locationType === 'string' &&
    LOCATION_TYPES.has(locationType)
  );
}

function usableIds(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((id) => typeof id === 'number' && Number.isFinite(id)))
  );
}

function usableOwnedStockScope(value: unknown): value is OwnedStockScope {
  if (typeof value !== 'object' || value === null) return false;
  const { mode, locations, excludedContainers, containers, hangars } = value as {
    mode?: unknown;
    locations?: unknown;
    excludedContainers?: unknown;
    containers?: unknown;
    hangars?: unknown;
  };
  if (mode === 'everywhere') return true;
  return (
    mode === 'selected' &&
    Array.isArray(locations) &&
    locations.every(usableOwnedStockLocation) &&
    usableIds(excludedContainers) &&
    usableIds(containers) &&
    (hangars === undefined ||
      (Array.isArray(hangars) &&
        hangars.every(
          (h) =>
            usableOwnedStockLocation(h) &&
            typeof (h as { division?: unknown }).division === 'number' &&
            Number.isFinite((h as { division: number }).division)
        )))
  );
}

function usableOwnedStock(value: unknown): value is Record<number, number> {
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([key, quantity]) =>
      key !== '' &&
      Number.isFinite(Number(key)) &&
      typeof quantity === 'number' &&
      Number.isFinite(quantity) &&
      quantity >= 0
  );
}

function usableGroup(value: unknown): value is BuildGroup {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, order, snapshot, autoBuildDefault, ownedStock, ownedStockScope } =
    value as Partial<BuildGroup>;
  return (
    typeof id === 'string' &&
    id !== '' &&
    typeof name === 'string' &&
    name.trim() !== '' &&
    typeof order === 'number' &&
    Number.isFinite(order) &&
    (snapshot === undefined || usableSnapshot(snapshot)) &&
    (autoBuildDefault === undefined || usableAutoBuildDefault(autoBuildDefault)) &&
    (ownedStock === undefined || usableOwnedStock(ownedStock)) &&
    (ownedStockScope === undefined || usableOwnedStockScope(ownedStockScope))
  );
}

export function parseBuildGroups(raw: unknown): BuildGroupsValue {
  return parseCharacterKeyedRecord(raw, (value) => coerceArrayEntry(value, usableGroup)) ?? {};
}

export function buildGroupsFor(value: BuildGroupsValue, characterId: number): BuildGroup[] {
  return [...(value[characterId] ?? [])].sort((a, b) => a.order - b.order);
}

function renumbered(groups: readonly BuildGroup[]): BuildGroup[] {
  return groups.map((group, index) => ({ ...group, order: index }));
}

export function withBuildGroups(
  value: BuildGroupsValue,
  characterId: number,
  groups: readonly BuildGroup[]
): BuildGroupsValue {
  const next = { ...value };
  if (groups.length === 0) delete next[characterId];
  else next[characterId] = renumbered(groups);
  return next;
}

export function addBuildGroup(
  value: BuildGroupsValue,
  characterId: number,
  group: { id: string; name: string }
): BuildGroupsValue {
  const existing = buildGroupsFor(value, characterId);
  return withBuildGroups(value, characterId, [
    ...existing,
    { id: group.id, name: group.name.trim(), order: existing.length },
  ]);
}

export function renameBuildGroup(
  value: BuildGroupsValue,
  characterId: number,
  groupId: string,
  name: string
): BuildGroupsValue {
  const trimmed = name.trim();
  if (trimmed === '') return value;
  const existing = buildGroupsFor(value, characterId);
  if (!existing.some((g) => g.id === groupId)) return value;
  return withBuildGroups(
    value,
    characterId,
    existing.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g))
  );
}

export function removeBuildGroup(
  value: BuildGroupsValue,
  characterId: number,
  groupId: string
): BuildGroupsValue {
  const existing = buildGroupsFor(value, characterId);
  return withBuildGroups(
    value,
    characterId,
    existing.filter((g) => g.id !== groupId)
  );
}

export function withGroupSnapshot(
  value: BuildGroupsValue,
  characterId: number,
  groupId: string,
  snapshot: BuildGroupSnapshot
): BuildGroupsValue {
  const existing = buildGroupsFor(value, characterId);
  if (!existing.some((g) => g.id === groupId)) return value;
  return withBuildGroups(
    value,
    characterId,
    existing.map((g) => (g.id === groupId ? { ...g, snapshot } : g))
  );
}

export function withGroupAutoBuildDefault(
  value: BuildGroupsValue,
  characterId: number,
  groupId: string,
  autoBuildDefault: BuildGroupAutoBuildDefault
): BuildGroupsValue {
  const existing = buildGroupsFor(value, characterId);
  if (!existing.some((g) => g.id === groupId)) return value;
  return withBuildGroups(
    value,
    characterId,
    existing.map((g) => (g.id === groupId ? { ...g, autoBuildDefault } : g))
  );
}

export function withGroupOwnedStock(
  value: BuildGroupsValue,
  characterId: number,
  groupId: string,
  ownedStock: Record<number, number>
): BuildGroupsValue {
  const existing = buildGroupsFor(value, characterId);
  if (!existing.some((g) => g.id === groupId)) return value;
  return withBuildGroups(
    value,
    characterId,
    existing.map((g) => (g.id === groupId ? { ...g, ownedStock } : g))
  );
}

export function withGroupOwnedStockScope(
  value: BuildGroupsValue,
  characterId: number,
  groupId: string,
  ownedStockScope: OwnedStockScope | undefined
): BuildGroupsValue {
  const existing = buildGroupsFor(value, characterId);
  if (!existing.some((g) => g.id === groupId)) return value;
  return withBuildGroups(
    value,
    characterId,
    existing.map((g) => (g.id === groupId ? { ...g, ownedStockScope } : g))
  );
}

export const useBuildGroups = createSyncedSetting<BuildGroupsValue>({
  key: SYNCED_BUILD_GROUPS_KEY,
  defaultValue: {},
  parse: parseBuildGroups,
});
