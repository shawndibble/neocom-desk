import type { SupportKind } from '../support';
import type { FittingStats } from '../types';

export interface TackleFigures {
  points: number;
  web: number;
  range: number;
}

export interface EwarFigures {
  strength: number;
  range: number;
  byKind: Partial<Record<SupportKind, number>>;
}

const EWAR_KINDS: ReadonlySet<SupportKind> = new Set([
  'ecm',
  'targetPainter',
  'trackingDisruptor',
  'sensorDampener',
  'guidanceDisruptor',
]);

export function tackleOf(s: FittingStats): TackleFigures {
  const rows = s.support.rows.filter((row) => row.kind === 'warpDisruption' || row.kind === 'web');
  const webs = rows.filter((row) => row.kind === 'web');
  return {
    points: rows
      .filter((row) => row.kind === 'warpDisruption')
      .reduce((sum, row) => sum + row.amount, 0),
    web: Math.max(0, ...webs.map((row) => row.amount)),
    range: rows.length > 0 ? Math.min(...rows.map((row) => row.optimal)) : 0,
  };
}

export function ewarOf(s: FittingStats): EwarFigures {
  const rows = s.support.rows.filter((row) => EWAR_KINDS.has(row.kind));
  const modules = rows.reduce((sum, row) => sum + row.count, 0);
  if (modules === 0) return { strength: 0, range: 0, byKind: {} };
  const byKind: EwarFigures['byKind'] = {};
  for (const row of rows) byKind[row.kind] = (byKind[row.kind] ?? 0) + row.amount * row.count;
  return {
    strength: rows.reduce((sum, row) => sum + row.amount * row.count, 0),
    byKind,
    range: rows.reduce((sum, row) => sum + (row.optimal + row.falloff) * row.count, 0) / modules,
  };
}
