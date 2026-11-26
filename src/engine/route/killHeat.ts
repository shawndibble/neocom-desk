import { lerpColor } from '../securityStatus';

const TEXT = { r: 0xde, g: 0xe7, b: 0xee };
const WARNING = { r: 0xf5, g: 0xb9, b: 0x4a };
const DANGER = { r: 0xff, g: 0x73, b: 0x69 };

export const SHIP_KILL_HEAT_STOPS = { yellow: 3, orange: 6, red: 10 } as const;

export function shipKillHeatColor(kills: number): string | null {
  if (kills <= 0) return null;
  const { yellow, orange, red } = SHIP_KILL_HEAT_STOPS;
  if (kills < yellow) return lerpColor(TEXT, WARNING, kills / yellow);
  if (kills < orange)
    return lerpColor(WARNING, DANGER, 0.5 * ((kills - yellow) / (orange - yellow)));
  if (kills < red)
    return lerpColor(WARNING, DANGER, 0.5 + 0.5 * ((kills - orange) / (red - orange)));
  return lerpColor(DANGER, DANGER, 0);
}
