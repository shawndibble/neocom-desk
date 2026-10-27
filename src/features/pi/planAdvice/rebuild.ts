import type { PiData } from '@/sde/types';
import { volumeOf } from '@/engine/pi/haulEffort';
import { CUSTOMS_TAXABLE_VALUE, isP0 } from '@/engine/pi/chain';
import { HOURS_PER_DAY } from '@/engine/pi/planAdvice';
import type {
  ColonyAdvice,
  RebuildCandidate,
  RebuildFacts,
  SellBooks,
} from '@/engine/pi/planAdvice';
import type { ScoredStopTier, StopTierAdvice, StopTierEntry } from '@/engine/pi/stopTier';
import type { PinLoad } from '@/engine/pi/types';
import { pinsLoad } from '@/engine/pi/pinBudget';
import type { BuiltColonyAdvice } from '../systemPlanetModel';
import type { PlannerColonyRow } from '../goalPlannerModel';
import { colonyBudget } from '../colonyBudgetModel';
import {
  colonyStopTierAdvice,
  currentProductTypeIds,
  meanHeadsPerExtractor,
} from '../stopTierModel';
import type { PlanColonyAdvice } from './types';

/** The P0s a product needs, and the factories in the order they are set (inputs first). */
export function recipeOf(typeId: number, pi: PiData): RebuildCandidate['recipe'] {
  const extracts = new Set<number>();
  const makes: { typeId: number; facility: 'basic' | 'advanced' | 'highTech' }[] = [];
  const seen = new Set<number>();
  const walk = (id: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (isP0(id, pi)) {
      extracts.add(id);
      return;
    }
    const schematic = pi.schematics[String(id)];
    if (!schematic) return;
    for (const input of schematic.inputs) walk(input.typeID);
    makes.push({ typeId: id, facility: schematic.facility });
  };
  walk(typeId);
  return { extracts: [...extracts].sort((a, b) => a - b), makes };
}

export function safeVolume(typeId: number, pi: PiData): number | null {
  try {
    return volumeOf(typeId, pi);
  } catch {
    return null;
  }
}

/**
 * What a layout earns a day, absolute: units sold at the sell market, less
 * sales tax, less the colony's customs on the one export. Nothing between tiers
 * is taxed on one planet.
 *
 * `ScoredStopTier.marginPerHour` is not this. For a made tier it is net of the
 * raw P0 the layout consumes, a margin over selling the ore, and `Today`
 * (`builtColonyEarnings`) is an absolute income. Comparing a rebuild with today
 * has to be absolute against absolute, so the figure is rebuilt here from the
 * scorer's own unit rate. Null when the sell market does not price the product.
 */
export function iskPerHourOf(
  entry: ScoredStopTier,
  books: SellBooks,
  taxRate: number
): number | null {
  const price = books.revenuePrices[entry.typeId];
  if (price === undefined || !Number.isFinite(price)) return null;
  const perUnit =
    price * (1 - books.salesTaxPct / 100) - taxRate * CUSTOMS_TAXABLE_VALUE[entry.tier];
  return entry.unitsPerHour * perUnit;
}

function candidateOf(
  entry: ScoredStopTier,
  needsCcLevel: number | null,
  pi: PiData,
  iskPerHour: number,
  headsPerExtractor: number
): RebuildCandidate | null {
  const volume = safeVolume(entry.typeId, pi);
  if (volume === null) return null;
  const unitsPerDay = entry.unitsPerHour * HOURS_PER_DAY;
  return {
    typeId: entry.typeId,
    name: entry.name,
    tier: entry.tier,
    iskPerDay: iskPerHour * HOURS_PER_DAY,
    m3PerDay: unitsPerDay * volume,
    unitsPerDay,
    pins: entry.pins,
    recipe: recipeOf(entry.typeId, pi),
    needsCcLevel,
    load: pinsLoad(entry.pins, pi.infrastructure, {
      extractorHeads: (entry.pins.extractorControlUnit ?? 0) * headsPerExtractor,
    }),
  };
}
/** Scored P1 and P2 candidates: one-planet recipes only, never raw P0. */
function recipeEntries(advice: StopTierAdvice): ScoredStopTier[] {
  const entries: readonly StopTierEntry[] = advice.entries;
  return entries.filter(isScoredRecipe);
}

export function isScoredRecipe(entry: StopTierEntry): entry is ScoredStopTier {
  return entry.status === 'scored' && (entry.tier === 1 || entry.tier === 2);
}

export function rebuildFitOf(
  advice: ColonyAdvice,
  upgradeLevel: number,
  pi: PiData
): PlanColonyAdvice['rebuildFit'] {
  if (advice.rebuild.status !== 'change') return null;
  const { load, needsCcLevel } = advice.rebuild.pick;
  if (!load) return null;
  const { level, budget } = colonyBudget(Math.max(upgradeLevel, needsCcLevel ?? 0), pi);
  return { level, used: load, budget };
}

export function rebuildFacts(args: {
  row: PlannerColonyRow;
  colony: BuiltColonyAdvice;
  pi: PiData;
  books: SellBooks;
  haulHours: number;
  ccSkill: number | null;
  /** The pilot's saved richness pick for this planet (`richnessOverride.ts`). */
  picked: readonly number[] | undefined;
  todayM3PerDay: number | null;
}): RebuildFacts | { refused: string } {
  const { row, colony, pi, books, haulHours } = args;
  const scoreAt = (budgetOverride?: PinLoad) =>
    colonyStopTierAdvice({
      colony,
      planetType: row.planetType,
      pi,
      prices: books.prices,
      revenuePrices: books.revenuePrices,
      taxRate: row.taxRate,
      salesTaxPct: books.salesTaxPct,
      bufferHours: haulHours,
      ...(args.picked ? { picked: args.picked } : {}),
      ...(budgetOverride ? { budgetOverride } : {}),
    });

  const heads = meanHeadsPerExtractor(colony);
  const own = scoreAt();
  if (own.status !== 'advised') return { refused: own.status };

  const candidates = new Map<number, RebuildCandidate>();
  for (const entry of recipeEntries(own.advice)) {
    const isk = iskPerHourOf(entry, books, row.taxRate);
    const candidate = isk === null ? null : candidateOf(entry, null, pi, isk, heads);
    if (candidate) candidates.set(candidate.typeId, candidate);
  }

  // What a higher Command Center would host, within the pilot's trained skill.
  // Each recipe is scored at the lowest level that hosts it.
  const reach = args.ccSkill === null ? 0 : colonyBudget(args.ccSkill, pi).level;
  for (let level = row.upgradeLevel + 1; level <= reach; level += 1) {
    const higher = scoreAt(colonyBudget(level, pi).budget);
    if (higher.status !== 'advised') break;
    for (const entry of recipeEntries(higher.advice)) {
      if (candidates.has(entry.typeId)) continue;
      const isk = iskPerHourOf(entry, books, row.taxRate);
      const candidate = isk === null ? null : candidateOf(entry, level, pi, isk, heads);
      if (candidate) candidates.set(candidate.typeId, candidate);
    }
  }

  return {
    planetId: row.planetId,
    planetType: row.planetType,
    colonyCcLevel: row.upgradeLevel,
    currentProductTypeIds: currentProductTypeIds(colony, pi),
    currentPins: colony.pinLoad.counts,
    todayM3PerDay: args.todayM3PerDay,
    candidates: [...candidates.values()],
  };
}
