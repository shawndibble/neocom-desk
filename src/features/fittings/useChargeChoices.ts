/**
 * The Charge Picker's data: for each weapon group (every fitted module of
 * one type that takes charges), every charge it takes with its figures for
 * this Fitting — the dogma engine's DPS, range and damage split with the
 * charge loaded, the pilot's missing skills, the Trade Hub's sell price and
 * what the cargo holds. The arithmetic on top lives in
 * `engine/fittings/chargeChoice.ts`.
 *
 * Mounted only where the picker shows (the Add panel's Charges tab, a
 * weapon's "Change charge" menu), so the engine pays one calculation per
 * charge only while someone is looking — memoized per hull, pilot and the
 * rest of the Fitting, so loading one of the group's own charges doesn't
 * recalculate the list.
 */
import { useEffect, useMemo, useState } from 'react';
import { factionName, type ChargeChoice, type ChargeTier } from '@/engine/fittings/chargeChoice';
import type {
  Fitting,
  FittingModuleResult,
  FittingSlotKind,
  PilotProfile,
} from '@/engine/fittings/types';
import { useMarketHub } from '@/features/market/hub';
import { getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import type { ChargeEngineStats } from './dogmaFittingEngine';
import type { FittingContext } from './fittingContext';
import type { FittingCatalogue } from './useFittingCatalogue';

/** The SDE meta groups (public/data/market/variations.json) a charge's tier reads off. */
const META_GROUP_TECH2 = 2;
const META_GROUP_FACTION = 4;

export interface WeaponChargeGroup {
  moduleTypeId: number;
  slot: FittingSlotKind;
  /** How many of the module are fitted. */
  count: number;
  /** Charges loaded in them now. */
  loaded: ReadonlySet<number>;
  /** Some charge deals damage: the picker. */
  isWeapon: boolean;
  /** Its charges inject capacitor: the cap booster guide. Neither (scripts, paste…): a plain list. */
  isCapBooster: boolean;
  /** Its charges are mining crystals: the crystal guide. */
  isMiner: boolean;
  /** Every charge the module takes, by name. */
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

/** Each charge's `ChargeChoice`: its tier and type group from the SDE variations, its figures from the engine. */
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

/**
 * What the engine's figures for one group depend on: everything in the
 * Fitting except the group's own charges (which `compareCharges` replaces)
 * and the cargo.
 */
function engineKey(fitting: Fitting, moduleTypeId: number): string {
  return JSON.stringify({
    ...fitting,
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
  { engine, profile, catalogue }: FittingContext,
  group: WeaponGroupBase
): EngineResult {
  const key = `${group.moduleTypeId}|${engineKey(fitting, group.moduleTypeId)}`;
  const cache = engineCache.get(profile) ?? new Map<string, EngineResult>();
  engineCache.set(profile, cache);
  const hit = cache.get(key);
  if (hit) return hit;

  const module = { slot: group.slot, typeId: group.moduleTypeId };
  const ids = group.chargeGroupIds.flatMap((id) => catalogue.typeIdsByGroup.get(id) ?? []);
  const fits = engine.checkCharges(fitting.shipTypeId, module, ids, profile);
  const candidates = ids.filter((id) => fits.has(id) && catalogue.types[String(id)] !== undefined);
  const result: EngineResult = {
    candidates,
    stats: new Map(
      engine
        .compareCharges(fitting, profile, group.moduleTypeId, candidates)
        .map((s) => [s.typeId, s])
    ),
    skillMissing: engine.chargesMissingSkills(fitting.shipTypeId, module, candidates, profile),
  };
  if (cache.size >= ENGINE_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

interface UseChargeChoicesParams {
  fitting: Fitting | null;
  /** Null while the engine, pilot or catalogue loads. */
  context: FittingContext | null;
  moduleResults: readonly FittingModuleResult[] | null;
  /** Only this module type's group; every group when absent. */
  moduleTypeId?: number;
}

export interface ChargeChoicesResult {
  /** Null while the engine or the Fitting's results aren't ready. */
  groups: WeaponChargeGroup[] | null;
  /** Hub prices still loading: every price reads null until then. */
  pricesLoading: boolean;
}

export function useChargeChoices({
  fitting,
  context,
  moduleResults,
  moduleTypeId,
}: UseChargeChoicesParams): ChargeChoicesResult {
  const hubId = useMarketHub((state) => state.value);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);

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
  const priceKey = `${hubId}|${priceIds.join(',')}`;
  const [prices, setPrices] = useState<{ key: string; map: Map<number, number | null> } | null>(
    null
  );
  useEffect(() => {
    const hub = getTradeHub(hubId);
    if (!hub || priceIds.length === 0) return;
    let cancelled = false;
    void getHubPrices(hub, priceIds)
      .then((aggregates) => {
        if (cancelled) return;
        const map = new Map<number, number | null>();
        for (const id of priceIds) map.set(id, aggregates.get(id)?.sellMin ?? null);
        setPrices({ key: priceKey, map });
      })
      .catch(() => {
        if (!cancelled) setPrices({ key: priceKey, map: new Map() });
      });
    return () => {
      cancelled = true;
    };
    // priceKey carries hubId and priceIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey]);

  const priceMap = prices?.key === priceKey ? prices.map : null;

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
