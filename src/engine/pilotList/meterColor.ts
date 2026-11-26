import { lerpColor } from '../securityStatus';

type Rgb = { r: number; g: number; b: number };

function rgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export const METER_STOPS: readonly (readonly [pct: number, hex: string])[] = [
  [0, '#6f8296'],
  [22, '#6e9cc4'],
  [42, '#74b59a'],
  [60, '#c8bb70'],
  [80, '#cf9460'],
  [100, '#d1675f'],
];

export function ratioMeterColor(pct: number): string {
  const p = Math.min(100, Math.max(0, pct));
  let i = 1;
  while (i < METER_STOPS.length - 1 && p > METER_STOPS[i][0]) i++;
  const [fromPct, fromHex] = METER_STOPS[i - 1];
  const [toPct, toHex] = METER_STOPS[i];
  return lerpColor(rgb(fromHex), rgb(toHex), (p - fromPct) / (toPct - fromPct));
}
