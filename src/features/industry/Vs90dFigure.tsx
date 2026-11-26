import { vs90dReadout } from './vs90d';

export function Vs90dFigure({ value }: { value: number | null | undefined }) {
  const readout = vs90dReadout(value);
  return readout && <span className={readout.toneClassName}>{readout.node}</span>;
}
