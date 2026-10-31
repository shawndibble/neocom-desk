/**
 * Export columns for the goal plan's Flow and Hauling tables, including the
 * facts the screen words once in a group header (what blocks a blocked goal)
 * or a placeholder (a leg's distance pending, or not routable).
 */
import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { joined } from '@/lib/exportSheets';
import type { DemandLine, FlowEnd, PlanetType } from '@/engine/pi/goalTypes';
import { piTier } from '@/engine/pi/chain';
import { commodityName } from '../goalPlannerFormat';
import { HOURS_PER_DAY, endName, planetTypesText, type PlanNames } from './format';

export function flowCsvColumns(
  t: CsvTranslate,
  pi: PlanNames['pi'],
  typeGaps: ReadonlyMap<number, readonly PlanetType[]>,
  sourceLabel: (line: DemandLine) => string
): CsvColumn<DemandLine>[] {
  return [
    { header: t('piPlan.flowTier'), value: (line) => `P${line.tier}` },
    { header: t('piPlan.flowItem'), value: (line) => commodityName(line.typeId, pi) },
    { header: t('piPlan.flowPerDay'), value: (line) => line.unitsPerHour * HOURS_PER_DAY },
    { header: t('piPlan.flowPerHour'), value: (line) => line.unitsPerHour },
    { header: t('piPlan.flowFactories'), value: (line) => line.factories },
    { header: t('piPlan.flowSource'), value: sourceLabel },
    {
      header: t('piPlan.csvBlockedBy'),
      value: (line) => {
        const p0s = blockedP0s(line);
        return p0s.length > 0 ? joined(p0s.map((p0) => commodityName(p0, pi))) : null;
      },
    },
    {
      header: t('piPlan.csvPlanetTypesNeeded'),
      value: (line) => {
        const needs = blockedP0s(line).flatMap((p0) => {
          const types = typeGaps.get(p0);
          return types?.length ? [`${commodityName(p0, pi)}: ${planetTypesText(types, t)}`] : [];
        });
        return needs.length > 0 ? joined(needs) : null;
      },
    },
  ];
}

/** The P0 resources a blocked goal lacks a planet for; empty for any other line. */
const blockedP0s = (line: DemandLine): readonly number[] =>
  line.source === 'blocked' ? (line.blockedBy ?? []) : [];

export interface LegRow {
  key: string;
  from: FlowEnd;
  to: FlowEnd;
  typeId: number;
  name: string;
  m3PerTrip: number;
  /** Undefined without distances yet; null when there is no route. */
  jumps: number | null | undefined;
}

export type RouteState = 'pending' | 'none' | 'sameSystem' | 'routed';

/** Where a leg's distance stands: still counting, unroutable, within one system, or a jump count. */
export function routeState(jumps: LegRow['jumps']): RouteState {
  if (jumps === undefined) return 'pending';
  if (jumps === null) return 'none';
  return jumps === 0 ? 'sameSystem' : 'routed';
}

export function haulingCsvColumns(t: CsvTranslate, names: PlanNames): CsvColumn<LegRow>[] {
  return [
    { header: t('piPlan.legFromCsv'), value: (row) => endName(row.from, names) },
    { header: t('piPlan.legToCsv'), value: (row) => endName(row.to, names) },
    { header: t('piPlan.flowTier'), value: (row) => `P${piTier(row.typeId, names.pi)}` },
    { header: t('piPlan.legItem'), value: (row) => row.name },
    // Rounded to cents: the flow arithmetic leaves float dust a spreadsheet would show.
    { header: t('piPlan.legM3'), value: (row) => Math.round(row.m3PerTrip * 100) / 100 },
    { header: t('piPlan.legJumps'), value: (row) => row.jumps ?? null },
    {
      // A blank Jumps cell is either "still counting" or "no route"; this says which.
      header: t('piPlan.csvRouteStatus'),
      value: (row) => t(`piPlan.csvRoute.${routeState(row.jumps)}`),
    },
  ];
}
