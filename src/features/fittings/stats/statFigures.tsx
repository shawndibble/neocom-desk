import { resourceOverage } from '@/engine/fittings/skillGaps';
import type { FittingStats } from '@/engine/fittings/types';
import type { StatChangeKey } from '@/engine/fittings/variationDelta';
import { HeatFigure } from '../StatFacts';
import { MakeItFitTrigger } from '../MakeItFitTrigger';
import type { FitResource } from '../makeItFitContext';

/** An over-budget CPU, powergrid or calibration figure, as the ring and List show theirs. */
export const OVER_BUDGET_TONE = 'font-semibold text-danger';

export type Figure = (
  format: (s: FittingStats) => string,
  toneClassName?: string,
  /** The stats it shows, which a previewed change replaces with `current → after`. */
  keys?: readonly StatChangeKey[]
) => React.ReactNode;

/**
 * A figure off the stats as `format` shows it, in the warning tone under
 * "Overheat all" only where heat changed it; nothing until the stats are in.
 */
export function makeFigure(stats: FittingStats | null): Figure {
  return (format, toneClassName, keys) =>
    stats ? (
      <HeatFigure stats={stats} format={format} toneClassName={toneClassName} keys={keys} />
    ) : undefined;
}

/** A CPU/PG/calibration figure: red when over, with its "Fix" link beneath. */
export function budgetFigure(
  figure: Figure,
  resource: FitResource,
  used: number,
  total: number,
  format: (s: FittingStats) => string,
  keys?: readonly StatChangeKey[]
) {
  const over = resourceOverage(used, total) > 0;
  return (
    <>
      {figure(format, over ? OVER_BUDGET_TONE : undefined, keys)}
      {over && (
        <span className="block">
          <MakeItFitTrigger resource={resource} />
        </span>
      )}
    </>
  );
}
