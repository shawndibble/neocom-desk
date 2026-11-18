import type { Calculation, Fit } from '@eveshipfit/dogma-engine';
import {
  extractCapacitorBudget,
  extractDroneLimits,
  extractFighterStats,
  extractFittingStats,
  extractLockedTargets,
  extractModuleResult,
  extractOffense,
  extractOverheatedStats,
  extractTank,
  type OffenseItem,
} from './stats';
import { extractAppliedDpsInputs } from './appliedWeapons';
import { extractSupport } from './support';
import { extractExplore } from './explore';
import { extractModuleFigures } from './moduleFigures';
import { extractMining, miningYield } from './mining';
import { extractFleetSupport } from './fleetSupport';
import { ITEM_DOGMA_ATTRIBUTE, type Fitting, type FittingStats, type RuleBreak } from './types';

/** What `assembleStats` reads: the engine's results, already calculated. */
export interface StatsAssemblyContext {
  fitting: Fitting;
  dogmaFit: Fit;
  /** The fit as the pilot set it: the modules' own results always come off this. */
  calculation: Calculation;
  /** Every figure comes off this one. */
  shown: Calculation;
  /** The heated figures shown next to `shown`'s; null for none. */
  beside: Calculation | null;
  /** Module type ids none of whose charges deal damage (probe launchers). */
  harmlessCharges: ReadonlySet<number>;
  ruleBreaks: RuleBreak[];
  /** The cloaks that warp cloaked, for `extractExplore`. */
  covertCloaks: ReadonlySet<number>;
}

/**
 * Every figure of a Fitting's stats off `shown`, with `beside`'s heated ones
 * next to them. Pure over the engine's output: nothing here calls the engine.
 */
export function assembleStats({
  fitting,
  dogmaFit,
  calculation,
  shown,
  beside,
  harmlessCharges,
  ruleBreaks,
  covertCloaks,
}: StatsAssemblyContext): Omit<FittingStats, 'allOverheated' | 'unheated'> {
  const baseStats = extractFittingStats(dogmaFit.items, shown.ship.attributes, shown.items);

  // Calibration and drone bandwidth have no single ship-level "used" id the
  // way cpuFree/powerFree do (see types.ts's DOGMA_ATTRIBUTE doc comment) —
  // summed here instead, since only this seam has both `dogmaFit.items`'
  // slot types and `calculation.items`' per-item attribute values. A drone
  // stack only draws bandwidth while deployed ('active'); one sitting in the
  // bay ('online') draws none.
  let calibrationUsed = 0;
  let droneBandwidthUsed = 0;
  dogmaFit.items.forEach((item, index) => {
    const itemAttributes = shown.items[index]?.attributes;
    if (!itemAttributes) return;
    if (item.slot.type === 'rig') {
      calibrationUsed += itemAttributes.get(ITEM_DOGMA_ATTRIBUTE.calibrationCost)?.value ?? 0;
    } else if (item.slot.type === 'drone_bay' && item.state === 'active') {
      const perDrone = itemAttributes.get(ITEM_DOGMA_ATTRIBUTE.droneBandwidthNeeded)?.value ?? 0;
      droneBandwidthUsed += perDrone * (item.quantity ?? 1);
    }
  });

  // `fittingToDogmaFit` puts the modules first, so module i is items[i].
  const modules = fitting.modules.map((_, index) => extractModuleResult(calculation.items[index]));

  // Drones follow the modules in `dogmaFit.items`.
  const offenseItems: OffenseItem[] = [
    ...fitting.modules.map((module) => ({
      typeId: module.typeId,
      chargeTypeId: module.chargeTypeId,
      quantity: 1,
      isDrone: false,
      chargeDamages: !harmlessCharges.has(module.typeId),
    })),
    ...fitting.drones.map((drone) => ({
      typeId: drone.typeId,
      quantity: drone.quantity,
      isDrone: true,
    })),
    // Fighters follow the drones.
    ...(fitting.fighters ?? []).map((fighter) => ({
      typeId: fighter.typeId,
      quantity: fighter.quantity,
      isDrone: true,
      isFighter: true,
    })),
  ];
  const offense = extractOffense(offenseItems, shown.items, beside?.items ?? null);
  const overheated = beside ? extractOverheatedStats(beside.ship.attributes) : null;

  const applied = extractAppliedDpsInputs(dogmaFit.items, shown.items, shown.character.attributes);
  const lockedTargets = extractLockedTargets(shown.ship.attributes, shown.character.attributes);

  return {
    ...baseStats,
    ruleBreaks,
    targeting: { ...baseStats.targeting, maxLockedTargets: lockedTargets.effective },
    ...extractDroneLimits(dogmaFit.items, shown.items, shown.character.attributes),
    calibrationUsed,
    droneBandwidthUsed,
    modules,
    offense,
    overheated,
    applied,
    capacitorBudget: extractCapacitorBudget(dogmaFit.items, shown.items, shown.ship.attributes),
    tank: extractTank(dogmaFit.items, shown.items, shown.ship.attributes, baseStats),
    support: extractSupport(dogmaFit.items, shown.items),
    mining: miningYield(extractMining(dogmaFit.items, shown.items)),
    explore: extractExplore(dogmaFit.items, shown.items, covertCloaks),
    moduleFigures: extractModuleFigures(dogmaFit.items, shown.items),
    fleetSupport: extractFleetSupport(dogmaFit.items, shown.items),
    fighters: extractFighterStats(shown.ship.attributes),
    lockedTargets,
  };
}
