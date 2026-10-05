/**
 * Units and plain-text naming the Goal Planner's result sections share.
 */
import type { TFunction } from 'i18next';
import type { PiData } from '@/sde/types';
import type { FitLimit, FlowEnd, PlanetType } from '@/engine/pi/goalTypes';
import type { TradeHub } from '@/market/hubs';
import { clampIskZero, formatIskCompact } from '@/lib/isk';
import { commodityName } from '../goalPlannerFormat';

export const HOURS_PER_DAY = 24;
export const PERCENT_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** Names and links the sections share. */
export interface PlanNames {
  planet: (planetId: number) => string;
  systemOf: (planetId: number) => number | undefined;
  hub: TradeHub;
  pi: PiData;
}

export function namesList(typeIds: readonly number[], pi: PiData): string {
  return typeIds.map((id) => commodityName(id, pi)).join(', ');
}

export function signedCompact(perDay: number): string {
  const rounded = clampIskZero(perDay, 0);
  return `${rounded > 0 ? '+' : ''}${formatIskCompact(rounded)}`;
}

/** Planet types as alternatives: "Gas or Ice". */
export function planetTypesText(types: readonly PlanetType[], t: TFunction): string {
  return types.map((type) => t(`pi.planetType.${type}`)).join(t('piPlan.or'));
}

export function limitsText(limits: readonly FitLimit[], t: TFunction): string {
  return limits
    .map((limit) => (limit === 'cpu' ? t('piPlan.cpu') : t('piPlan.powergrid')))
    .join(', ');
}

/** Either end of a haul, by name: the hub's system or the colony. */
export function endName(end: FlowEnd, names: PlanNames): string {
  return end === 'hub' ? names.hub.systemName : names.planet(end);
}
