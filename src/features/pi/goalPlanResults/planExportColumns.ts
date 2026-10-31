/**
 * Export columns for the goal plan's Flow and Hauling tables. Pulled out of
 * the components so the facts the screen keeps in a group header (what blocks a
 * blocked goal) or a placeholder (a leg's distance still being counted, or
 * not routable) are columns of their own and testable without rendering.
 */
import type { TFunction } from 'i18next';
import type { CsvColumn } from '@/lib/csv';
import type { DemandLine, FlowEnd, PlanetType } from '@/engine/pi/goalTypes';
import { piTier } from '@/engine/pi/chain';
import { commodityName } from '../goalPlannerFormat';
import { HOURS_PER_DAY, endName, planetTypesText, type PlanNames } from './format';

export function flowCsvColumns(
  t: TFunction,
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
      // The P0 a blocked goal lacks a planet for — the screen words it once in the group header.
      header: t('piPlan.csvBlockedBy'),
      value: (line) =>
        line.source === 'blocked' && line.blockedBy?.length
          ? line.blockedBy.map((p0) => commodityName(p0, pi)).join('; ')
          : null,
    },
    {
      header: t('piPlan.csvPlanetTypesNeeded'),
      value: (line) => {
        if (line.source !== 'blocked' || !line.blockedBy?.length) return null;
        const needs = line.blockedBy.flatMap((p0) => {
          const types = typeGaps.get(p0);
          return types?.length ? [`${commodityName(p0, pi)}: ${planetTypesText(types, t)}`] : [];
        });
        return needs.length > 0 ? needs.join('; ') : null;
      },
    },
  ];
}

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

export function haulingCsvColumns(t: TFunction, names: PlanNames): CsvColumn<LegRow>[] {
  return [
    { header: t('piPlan.legFromCsv'), value: (row) => endName(row.from, names) },
    { header: t('piPlan.legToCsv'), value: (row) => endName(row.to, names) },
    { header: t('piPlan.flowTier'), value: (row) => `P${piTier(row.typeId, names.pi)}` },
    { header: t('piPlan.legItem'), value: (row) => row.name },
    { header: t('piPlan.legM3'), value: (row) => row.m3PerTrip },
    { header: t('piPlan.legJumps'), value: (row) => row.jumps ?? null },
    {
      // A blank Jumps cell is either "still counting" or "no route"; this says which.
      header: t('piPlan.csvRouteStatus'),
      value: (row) =>
        row.jumps === undefined
          ? t('piPlan.csvRoute.pending')
          : row.jumps === null
            ? t('piPlan.csvRoute.none')
            : row.jumps === 0
              ? t('piPlan.csvRoute.sameSystem')
              : t('piPlan.csvRoute.routed'),
    },
  ];
}
