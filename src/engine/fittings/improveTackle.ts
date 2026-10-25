/**
 * Hold tighter and Stronger EWAR (Improve Goals): what the fit's projected
 * tackle and electronic-warfare modules put out, read off `support.rows`.
 * EWAR is module strength and range, not the effect on a target: the engine
 * does not compute that, so the drawer labels it. Bubbles are not modelled
 * and stay out. Pure.
 */
import type { SupportKind } from './support';
import type { FittingStats } from './types';

/** Warp scrambler and disruptor points, the strongest web (%), and the shortest tackle reach (m). */
export interface TackleFigures {
  points: number;
  web: number;
  range: number;
}

/** Total electronic-warfare module strength, and the mean reach (optimal + falloff, m) per module. */
export interface EwarFigures {
  strength: number;
  range: number;
}

/** The kinds Stronger EWAR scores; webs and warp disruption are Hold tighter's. */
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
    // The shortest reach is where the target escapes first.
    range: rows.length > 0 ? Math.min(...rows.map((row) => row.optimal)) : 0,
  };
}

export function ewarOf(s: FittingStats): EwarFigures {
  const rows = s.support.rows.filter((row) => EWAR_KINDS.has(row.kind));
  const modules = rows.reduce((sum, row) => sum + row.count, 0);
  if (modules === 0) return { strength: 0, range: 0 };
  return {
    strength: rows.reduce((sum, row) => sum + row.amount * row.count, 0),
    range: rows.reduce((sum, row) => sum + (row.optimal + row.falloff) * row.count, 0) / modules,
  };
}
