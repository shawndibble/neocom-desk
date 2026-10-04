export type SecurityBand = 'highsec' | 'lowsec' | 'nullsec';

/**
 * EVE's own security-status bands: highsec 0.5+, lowsec 0.1-0.4, nullsec 0.0
 * and below (including negative, which is where J-space sits).
 *
 * Banded on the status **rounded to one decimal**, not the raw float ESI
 * publishes, because that is the number the game both displays and enforces.
 * Balle is 0.4608891 in ESI and a 0.5 highsec system in game; banding the raw
 * value called it lowsec, which is the wrong rig multiplier for an industry job
 * (1.9x instead of 1x) and the wrong POCO base rate in `features/pi/customsRate`.
 * `securityStatusColor` below asks this function where the boundary is, so the
 * color and the rig multiplier can never disagree about the same system.
 */
/**
 * The security status rounded to one decimal — the number the game itself
 * displays and enforces, and the only form any banding here is done on.
 * Exported so a caller drawing its own line (issue #946 counts systems at 0.5
 * or below, which is a different cut from `securityBand`'s) draws it on the
 * same number rather than re-deriving the rounding.
 */
export function shownSecurity(security: number): number {
  return Math.round(security * 10) / 10;
}

export function securityBand(security: number): SecurityBand {
  const shown = shownSecurity(security);
  if (shown >= 0.5) return 'highsec';
  if (shown >= 0.1) return 'lowsec';
  return 'nullsec';
}

const SUCCESS = { r: 0x5f, g: 0xd5, b: 0x84 }; // --success
const ACCENT = { r: 0x57, g: 0xc7, b: 0xf4 }; // --accent
const WARNING = { r: 0xf5, g: 0xb9, b: 0x4a }; // --warning
const DANGER = { r: 0xff, g: 0x73, b: 0x69 }; // --danger

const HIGHSEC_FLOOR = 0.5;
const HIGHSEC_GREEN = 0.7;
const HIGHSEC_CEIL = 1.0;
const LOWSEC_CEIL = 0.4;
const LOWSEC_FLOOR = 0.1;
// Lowsec's orange, as a point on the warning→danger blend: 40% of the way at
// 0.4, deepening to 60% by 0.1 — far enough short of nullsec's full red that a
// 0.1 and a 0.0 cell side by side on the route strip still read apart.
const LOWSEC_BLEND_TOP = 0.4;
const LOWSEC_BLEND_BOTTOM = 0.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function toHex(channel: number): string {
  return clamp(channel, 0, 255).toString(16).padStart(2, '0');
}

function lerpColor(a: { r: number; g: number; b: number }, b: typeof a, t: number): string {
  return `#${toHex(lerpChannel(a.r, b.r, t))}${toHex(lerpChannel(a.g, b.g, t))}${toHex(lerpChannel(a.b, b.b, t))}`;
}

const DANGER_HEX = lerpColor(DANGER, DANGER, 0);

/**
 * Colors a solar system's security status on the game client's own scale:
 * across highsec, warning yellow at 0.5 blending to success green at 0.7 and
 * on to accent blue at 1.0; orange across lowsec (deepening from 0.4 to 0.1
 * without reaching red); and flat danger red for every nullsec system. The
 * sharp jumps at both boundaries mirror the game's bands, not an
 * interpolation artifact.
 *
 * Which side of that jump a system falls on is `securityBand`'s call, on the
 * rounded status — the same number the badge prints beside this color. Testing
 * the raw float here instead painted Ainsan (0.4730616, a highsec system shown
 * as 0.5) in the lowsec color. Only the branch rounds: the gradients within
 * highsec and lowsec still interpolate the raw value, so neighbours stay
 * distinguishable. The gradients run between the shown stops (0.5, 0.4, 0.1),
 * so the half-step of raw values that rounds onto a stop shares its color.
 */
export function securityStatusColor(security: number): string {
  const band = securityBand(security);
  if (band === 'nullsec') return DANGER_HEX;
  if (band === 'highsec') {
    if (security < HIGHSEC_GREEN) {
      const t = clamp((security - HIGHSEC_FLOOR) / (HIGHSEC_GREEN - HIGHSEC_FLOOR), 0, 1);
      return lerpColor(WARNING, SUCCESS, t);
    }
    const t = clamp((security - HIGHSEC_GREEN) / (HIGHSEC_CEIL - HIGHSEC_GREEN), 0, 1);
    return lerpColor(SUCCESS, ACCENT, t);
  }
  const t = clamp((LOWSEC_CEIL - security) / (LOWSEC_CEIL - LOWSEC_FLOOR), 0, 1);
  return lerpColor(
    WARNING,
    DANGER,
    LOWSEC_BLEND_TOP + t * (LOWSEC_BLEND_BOTTOM - LOWSEC_BLEND_TOP)
  );
}
