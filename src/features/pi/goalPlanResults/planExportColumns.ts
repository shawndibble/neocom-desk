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

const blockedP0s = (line: DemandLine): readonly number[] =>
  line.source === 'blocked' ? (line.blockedBy ?? []) : [];

export interface LegRow {
  key: string;
  from: FlowEnd;
  to: FlowEnd;
  typeId: number;
  name: string;
  m3PerTrip: number;
  jumps: number | null | undefined;
}

export type RouteState = 'pending' | 'none' | 'sameSystem' | 'routed';

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
    { header: t('piPlan.legM3'), value: (row) => Math.round(row.m3PerTrip * 100) / 100 },
    { header: t('piPlan.legJumps'), value: (row) => row.jumps ?? null },
    {
      header: t('piPlan.csvRouteStatus'),
      value: (row) => t(`piPlan.csvRoute.${routeState(row.jumps)}`),
    },
  ];
}
