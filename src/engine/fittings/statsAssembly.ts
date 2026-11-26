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

export interface StatsAssemblyContext {
  fitting: Fitting;
  dogmaFit: Fit;
  calculation: Calculation;
  shown: Calculation;
  beside: Calculation | null;
  harmlessCharges: ReadonlySet<number>;
  ruleBreaks: RuleBreak[];
  covertCloaks: ReadonlySet<number>;
}

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

  const modules = fitting.modules.map((_, index) => extractModuleResult(calculation.items[index]));

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
