import { lerpColor } from '../securityStatus';

const TEXT = { r: 0xde, g: 0xe7, b: 0xee }; // --text
const WARNING = { r: 0xf5, g: 0xb9, b: 0x4a }; // --warning
const DANGER = { r: 0xff, g: 0x73, b: 0x69 }; // --danger

/**
 * Ship kills in a system's last hour where the ramp reaches each color. One
 * to two kills is background noise on a busy lane and barely tints; three is
 * a fight (yellow); six is a camp forming (orange); ten or more is a gate
 * being held, as red as the scale goes.
 */
export const SHIP_KILL_HEAT_STOPS = { yellow: 3, orange: 6, red: 10 } as const;

/**
 * Text color for a system's last-hour ship kills: the default text color at
 * none (null: leave the cell as it is), blending to `warning` yellow at the
 * yellow stop, halfway along `warning`→`danger` orange at the orange stop, and
 * `danger` red from the red stop up. Computed like `securityStatusColor`;
 * callers always print the count beside it, so the color is never the only
 * signal.
 */
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
