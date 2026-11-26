import { useCallback, useMemo } from 'react';
import { factionName, type ChargeChoice, type ChargeTier } from '@/engine/fittings/chargeChoice';
import type {
  Fitting,
  FittingModuleResult,
  FittingSlotKind,
  PilotProfile,
} from '@/engine/fittings/types';
import { useHubFor } from '@/features/market/hub';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { getHubPricesAt } from '@/features/market/hubPricesAtPercent';
import { getTradeHub } from '@/market/hubs';
import type { ChargeBasis, ChargeEngineStats } from './dogmaFittingEngine';
import type { FittingContext } from './fittingContext';
import type { FittingCatalogue } from './useFittingCatalogue';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

const META_GROUP_TECH2 = 2;
const META_GROUP_FACTION = 4;

export interface WeaponChargeGroup {
  moduleTypeId: number;
  slot: FittingSlotKind;
  count: number;
  loaded: ReadonlySet<number>;
  isWeapon: boolean;
  isCapBooster: boolean;
  isMiner: boolean;
  choices: ChargeChoice[];
}

interface BuildInput {
  typeIds: readonly number[];
  stats: ReadonlyMap<number, ChargeEngineStats>;
  skillMissing: ReadonlySet<number>;
  prices: ReadonlyMap<number, number | null>;
  cargo: ReadonlyMap<number, number>;
  catalogue: Pick<FittingCatalogue, 'types' | 'variations'>;
}

export function buildChargeChoices({
  typeIds,
  stats,
  skillMissing,
  prices,
  cargo,
  catalogue,
}: BuildInput): ChargeChoice[] {
  const name = (typeId: number) => catalogue.types[String(typeId)]?.name ?? `#${typeId}`;
  return typeIds
    .map((typeId): ChargeChoice => {
      const variation = catalogue.variations.types[typeId];
      const s = stats.get(typeId);
      const isFaction =
        variation?.metaGroupId === META_GROUP_FACTION && variation.parentTypeId !== null;
      const tier: ChargeTier = isFaction
        ? 'faction'
        : variation?.metaGroupId === META_GROUP_TECH2 || (s?.techLevel ?? 1) >= 2
          ? 'tech2'
          : 'tech1';
      const baseTypeId = isFaction ? variation.parentTypeId! : typeId;
      const baseName = name(baseTypeId);
      return {
        typeId,
        name: name(typeId),
        baseTypeId,
        baseName,
        tier,
        faction: isFaction ? (factionName(name(typeId), baseName) ?? name(typeId)) : null,
        dps: s?.dps ?? 0,
        optimal: s?.optimal ?? 0,
        falloff: s?.falloff ?? 0,
        damage: s?.damage ?? null,
        price: prices.get(typeId) ?? null,
        roundsPerMinute: s?.roundsPerMinute ?? null,
        cargo: cargo.get(typeId) ?? 0,
        skillMissing: skillMissing.has(typeId),
        ...(s?.cap ? { cap: s.cap } : {}),
        ...(s?.mining ? { mining: s.mining } : {}),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface WeaponGroupBase {
  moduleTypeId: number;
  slot: FittingSlotKind;
  count: number;
  chargeGroupIds: number[];
  loaded: Set<number>;
}

function weaponGroupsOf(
  fitting: Fitting,
  moduleResults: readonly FittingModuleResult[]
): WeaponGroupBase[] {
  const byType = new Map<number, WeaponGroupBase>();
  fitting.modules.forEach((module, index) => {
    const chargeGroupIds = moduleResults[index]?.chargeGroupIds ?? [];
    if (chargeGroupIds.length === 0) return;
    const entry = byType.get(module.typeId) ?? {
      moduleTypeId: module.typeId,
      slot: module.slot,
      count: 0,
      chargeGroupIds,
      loaded: new Set<number>(),
    };
    entry.count += 1;
    if (module.chargeTypeId !== undefined) entry.loaded.add(module.chargeTypeId);
    byType.set(module.typeId, entry);
  });
  return [...byType.values()];
}

function engineKey(fitting: Fitting, moduleTypeId: number, basis?: ChargeBasis): string {
  return JSON.stringify({
    ...fitting,
    damageProfile: basis?.damageProfile,
    conditions: basis?.options,
    name: '',
    cargo: [],
    modules: fitting.modules.map((m) =>
      m.typeId === moduleTypeId ? { ...m, chargeTypeId: 0, chargeQuantity: 0 } : m
    ),
  });
}

interface EngineResult {
  candidates: number[];
  stats: Map<number, ChargeEngineStats>;
  skillMissing: Set<number>;
}

const engineCache = new WeakMap<PilotProfile, Map<string, EngineResult>>();
const ENGINE_CACHE_LIMIT = 24;

function engineFigures(
  fitting: Fitting,
  { engine, profile, catalogue, basis }: FittingContext,
  group: WeaponGroupBase
): EngineResult {
  const pilot = basis?.pilot ?? profile;
  const key = `${group.moduleTypeId}|${engineKey(fitting, group.moduleTypeId, basis)}`;
  const cache = engineCache.get(pilot) ?? new Map<string, EngineResult>();
  engineCache.set(pilot, cache);
  const hit = cache.get(key);
  if (hit) return hit;

  const module = { slot: group.slot, typeId: group.moduleTypeId };
  const ids = group.chargeGroupIds.flatMap((id) => catalogue.typeIdsByGroup.get(id) ?? []);
  const fits = engine.checkCharges(fitting.shipTypeId, module, ids, pilot);
  const candidates = ids.filter((id) => fits.has(id) && catalogue.types[String(id)] !== undefined);
  const result: EngineResult = {
    candidates,
    stats: new Map(
      engine
        .compareCharges(fitting, profile, group.moduleTypeId, candidates, basis)
        .map((s) => [s.typeId, s])
    ),
    skillMissing: engine.chargesMissingSkills(fitting.shipTypeId, module, candidates, pilot),
  };
  if (cache.size >= ENGINE_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

interface UseChargeChoicesParams {
  fitting: Fitting | null;
  context: FittingContext | null;
  moduleResults: readonly FittingModuleResult[] | null;
  moduleTypeId?: number;
}

export interface ChargeChoicesResult {
  groups: WeaponChargeGroup[] | null;
  pricesLoading: boolean;
}

export function useChargeChoices({
  fitting,
  context,
  moduleResults,
  moduleTypeId,
}: UseChargeChoicesParams): ChargeChoicesResult {
  const { hubId } = useHubFor('fittings');
  const percent = usePricePercentFor('fittings');

  const figuresByGroup = useMemo(() => {
    if (!fitting || !context || !moduleResults) return null;
    return weaponGroupsOf(fitting, moduleResults)
      .filter((g) => moduleTypeId === undefined || g.moduleTypeId === moduleTypeId)
      .map((group) => ({ group, figures: engineFigures(fitting, context, group) }));
  }, [fitting, context, moduleResults, moduleTypeId]);

  const priceIds = useMemo(
    () =>
      [...new Set((figuresByGroup ?? []).flatMap((e) => e.figures.candidates))].sort(
        (a, b) => a - b
      ),
    [figuresByGroup]
  );
  const hub = getTradeHub(hubId);
  const loadPrices = useCallback(async () => {
    const map = new Map<number, number | null>();
    if (!hub) return map;
    try {
      const aggregates = await getHubPricesAt(hub, priceIds, percent);
      for (const id of priceIds) map.set(id, aggregates.get(id)?.sellMin ?? null);
    } catch {
      map.clear();
    }
    return map;
  }, [hub, priceIds, percent]);
  const prices = useKeyedLoad(
    hub && priceIds.length > 0 ? `${hubId}|${percent}|${priceIds.join(',')}` : null,
    loadPrices
  );
  const priceMap = prices.status === 'ready' ? prices.data : null;

  const groups = useMemo(() => {
    if (!figuresByGroup || !context || !fitting) return null;
    const cargo = new Map<number, number>();
    for (const item of fitting.cargo)
      cargo.set(item.typeId, (cargo.get(item.typeId) ?? 0) + item.quantity);
    return figuresByGroup.map(({ group, figures }): WeaponChargeGroup => {
      const choices = buildChargeChoices({
        typeIds: figures.candidates,
        stats: figures.stats,
        skillMissing: figures.skillMissing,
        prices: priceMap ?? new Map(),
        cargo,
        catalogue: context.catalogue,
      });
      return {
        moduleTypeId: group.moduleTypeId,
        slot: group.slot,
        count: group.count,
        loaded: group.loaded,
        isWeapon: choices.some((c) => c.dps > 0),
        isCapBooster: choices.some((c) => c.cap !== undefined),
        isMiner: choices.some((c) => c.mining !== undefined),
        choices,
      };
    });
  }, [figuresByGroup, context, fitting, priceMap]);

  return { groups, pricesLoading: priceIds.length > 0 && priceMap === null };
}
