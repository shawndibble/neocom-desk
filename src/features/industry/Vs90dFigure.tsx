import { vs90dReadout } from './vs90d';

/**
 * A "vs 90d" figure for the Build Opportunities tables: "+35%" in amber from
 * the spike threshold up, "−12%" plain, blank when unknown (too few traded
 * days, a stale latest day, a failed read), and a dim "…" while still being read.
 */
export function Vs90dFigure({ value }: { value: number | null | undefined }) {
  const readout = vs90dReadout(value);
  return readout && <span className={readout.toneClassName}>{readout.node}</span>;
}
