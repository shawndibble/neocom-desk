/**
 * Everything a built colony's card and its detail modal both need, derived
 * once.
 *
 * The card shows the instructions and the modal shows the same instructions
 * with their reasoning, so both need the identical headroom, idle-facility
 * plan and nearest-affordable pin. Computing them in each component is how the
 * two surfaces end up disagreeing about whether a facility is idle — so they
 * are derived here and passed down.
 *
 * `nearestPin` and `roomSummary` moved here from `AdvisorPanel.tsx` for the
 * same reason: they are inputs to that shared answer, not to one card's markup.
 */
import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { PiData, PiPinKind } from '@/sde/types';
import { EXTRACTOR_HEADS_MAX, spareCapacity } from '@/engine/pi/pinBudget';
import type { PinLoad } from '@/engine/pi/types';
import type { BuiltColonyAdvice } from './advisorModel';
import { colonyFactoryBalance } from './factoryBalanceModel';
import { idleFacilityPlan, type IdleFacilityPlan } from './colonyActionModel';

/** The kinds worth offering as headroom, in the order a planner reaches for them. */
export const HEADROOM_KINDS: readonly PiPinKind[] = [
  'extractorControlUnit',
  'basic',
  'advanced',
  'highTech',
  'storage',
  'launchpad',
];

/**
 * Heads assumed when costing a *hypothetical* extra extractor for the
 * headroom row: a full complement. An ECU fitted with fewer heads reaches
 * less, so quoting the cheap end would promise room for an extractor nobody
 * would actually build.
 */
export const HEADROOM_EXTRACTOR_HEADS = EXTRACTOR_HEADS_MAX;

/**
 * The pin this colony came nearest to affording, and what it would have cost
 * with the link it needs.
 *
 * "The budget is spent" is true and unhelpful: a colony with 13,715 tf and
 * 300 MW free has not spent its budget, it is 100 MW short of one High-Tech
 * plant. Nearness is measured as the fraction of the pin the remainder covers
 * on its tighter axis, so the answer is the pin a pilot is closest to being
 * able to place rather than merely the cheapest one.
 *
 * Null when no kind can be measured that way — a payload with no pin costs at
 * all — rather than naming an arbitrary one.
 */
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

/**
 * The two pins a leftover budget goes furthest on, in words.
 *
 * Most-of-it-first rather than declaration order: a planner offered "1
 * extractor" and "6 high-tech plants" wants to hear about the six. Two, because
 * the sentence this lands in is a caveat on another number, not a list.
 */
export function roomSummary(headroom: Record<PiPinKind, number>, t: TFunction): string {
  return [...HEADROOM_KINDS]
    .filter((kind) => (headroom[kind] ?? 0) > 0)
    .sort((a, b) => (headroom[b] ?? 0) - (headroom[a] ?? 0))
    .slice(0, 2)
    .map((kind) =>
      t('piAdvisor.roomForItem', { count: headroom[kind], pin: t(`piAdvisor.pinKind.${kind}`) })
    )
    .join(' · ');
}

export interface ColonyPlan {
  /** This colony's own Command Center budget, from its own upgrade level. */
  budget: PinLoad;
  /** What a link this colony has not built yet would cost; null when unmeasurable. */
  newLinkCost: PinLoad | null;
  headroom: Record<PiPinKind, number>;
  /** True when nothing at all fits in what is left. */
  full: boolean;
  spare: PinLoad;
  /** The pin a full colony came nearest to affording; null when something fits. */
  closest: { kind: PiPinKind; cost: PinLoad } | null;
  /** The idle-facility decision; null when every facility is fed. */
  idle: IdleFacilityPlan | null;
}

/**
 * A built colony's derived plan. One `useMemo` chain, so the card and the
 * modal read the same object rather than two equal ones.
 */
export function useColonyPlan(colony: BuiltColonyAdvice, pi: PiData): ColonyPlan {
  return useMemo(() => {
    const budget = colony.budget;
    // A new pin is not reachable without a new link, and a link's cost is
    // distance-based — so the only honest price for one the colony has not
    // built comes from its own links: the longest hop it already has, at
    // level 0. Null when there is none to measure, which the card says rather
    // than charging zero.
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
  }, [colony, pi]);
}

/** How many instructions a card shows before the rest go to the modal. */
export const CARD_DIRECTIVE_LIMIT = 2;

/**
 * Which instructions a card shows, and in what order.
 *
 * Removals lead because they are a fault rather than an option — a facility
 * nothing feeds is drawing budget for nothing, and every gain below rests on
 * the budget it would free.
 *
 * But leading is not the same as crowding out. A colony with two idle
 * schematics and one opportunity would spend both slots on removals and push a
 * five-figure-an-hour line behind "1 more in Details" — burying the number a
 * pilot came to the tab for. So when both kinds are present the cap reserves
 * its last slot for the best-paying gain (`planNetwork` allocates best-paying
 * first, so that is the head of the list). The rest go to the modal, which
 * shows every one of them.
 */
export function cappedRows<T>(removals: readonly T[], gains: readonly T[], limit: number): T[] {
  if (removals.length === 0 || gains.length === 0) return [...removals, ...gains].slice(0, limit);
  return [...removals.slice(0, Math.max(1, limit - 1)), gains[0]].slice(0, limit);
}
