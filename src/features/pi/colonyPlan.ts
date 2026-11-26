import type { TFunction } from 'i18next';
import type { PiData, PiPinKind } from '@/sde/types';
import { EXTRACTOR_HEADS_MAX, spareCapacity } from '@/engine/pi/pinBudget';
import type { PinCounts, PinLoad } from '@/engine/pi/types';
import type { BuiltColonyAdvice } from './systemPlanetModel';
import { colonyFactoryBalance } from './factoryBalanceModel';
import { idleFacilityPlan, type IdleFacilityPlan } from './colonyActionModel';

const HEADROOM_KINDS: readonly PiPinKind[] = [
  'extractorControlUnit',
  'basic',
  'advanced',
  'highTech',
  'storage',
  'launchpad',
];

export const HEADROOM_EXTRACTOR_HEADS = EXTRACTOR_HEADS_MAX;

export function nearestPin(
  freeCpu: number,
  freePowergrid: number,
  pi: PiData,
  newLinkCost: PinLoad | null
): { kind: PiPinKind; cost: PinLoad } | null {
  let best: { kind: PiPinKind; cost: PinLoad; fraction: number } | null = null;
  for (const kind of HEADROOM_KINDS) {
    const spec = pi.infrastructure.pins[kind];
    if (!spec) continue;
    const heads = kind === 'extractorControlUnit' ? HEADROOM_EXTRACTOR_HEADS : 0;
    const cost = {
      cpu: spec.cpu + pi.infrastructure.extractorHead.cpu * heads + (newLinkCost?.cpu ?? 0),
      powergrid:
        spec.powergrid +
        pi.infrastructure.extractorHead.powergrid * heads +
        (newLinkCost?.powergrid ?? 0),
    };
    if (cost.cpu <= 0 && cost.powergrid <= 0) continue;
    const fraction = Math.min(
      cost.cpu > 0 ? freeCpu / cost.cpu : Infinity,
      cost.powergrid > 0 ? freePowergrid / cost.powergrid : Infinity
    );
    if (!best || fraction > best.fraction) best = { kind, cost, fraction };
  }
  return best ? { kind: best.kind, cost: best.cost } : null;
}

const LAYOUT_KINDS: readonly PiPinKind[] = [
  'extractorControlUnit',
  'basic',
  'advanced',
  'highTech',
];

export function layoutLabel(pins: PinCounts, t: TFunction): string {
  return LAYOUT_KINDS.filter((kind) => (pins[kind] ?? 0) > 0)
    .map((kind) =>
      t('piShared.layoutPin', { count: pins[kind], pin: t(`piShared.pinKind.${kind}`) })
    )
    .join(' → ');
}

export function roomSummary(headroom: Record<PiPinKind, number>, t: TFunction): string {
  return [...HEADROOM_KINDS]
    .filter((kind) => (headroom[kind] ?? 0) > 0)
    .sort((a, b) => (headroom[b] ?? 0) - (headroom[a] ?? 0))
    .slice(0, 2)
    .map((kind) =>
      t('piShared.roomForItem', { count: headroom[kind], pin: t(`piShared.pinKind.${kind}`) })
    )
    .join(' · ');
}

export interface ColonyPlan {
  budget: PinLoad;
  newLinkCost: PinLoad | null;
  headroom: Record<PiPinKind, number>;
  full: boolean;
  spare: PinLoad;
  closest: { kind: PiPinKind; cost: PinLoad } | null;
  idle: IdleFacilityPlan | null;
}

export function colonyPlan(colony: BuiltColonyAdvice, pi: PiData): ColonyPlan {
  {
    const budget = colony.budget;
    const newLinkCost = colony.pinLoad.newLinkLoad;
    const headroom = spareCapacity(colony.pinLoad.load, budget, pi.infrastructure, {
      headsPerExtractor: HEADROOM_EXTRACTOR_HEADS,
      ...(newLinkCost ? { newLinkCost } : {}),
    });
    const spare = {
      cpu: Math.max(0, budget.cpu - colony.pinLoad.load.cpu),
      powergrid: Math.max(0, budget.powergrid - colony.pinLoad.load.powergrid),
    };
    const full = HEADROOM_KINDS.every((kind) => (headroom[kind] ?? 0) <= 0);
    const balance = colonyFactoryBalance(colony, pi);
    return {
      budget,
      newLinkCost,
      headroom,
      full,
      spare,
      closest: full ? nearestPin(spare.cpu, spare.powergrid, pi, newLinkCost) : null,
      idle: idleFacilityPlan({ colony, balance, pi, spare, newLinkCost }),
    };
  }
}

export const CARD_DIRECTIVE_LIMIT = 2;

export function cappedRows<T>(removals: readonly T[], gains: readonly T[], limit: number): T[] {
  if (removals.length === 0 || gains.length === 0) return [...removals, ...gains].slice(0, limit);
  return [...removals.slice(0, Math.max(1, limit - 1)), gains[0]].slice(0, limit);
}
