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
export function securityBand(security: number): SecurityBand {
  const shown = Math.round(security * 10) / 10;
  if (shown >= 0.5) return 'highsec';
  if (shown >= 0.1) return 'lowsec';
  return 'nullsec';
}

const SUCCESS = { r: 0x5f, g: 0xd5, b: 0x84 }; // --success
const ACCENT = { r: 0x57, g: 0xc7, b: 0xf4 }; // --accent
const WARNING = { r: 0xf5, g: 0xb9, b: 0x4a }; // --warning
const DANGER = { r: 0xff, g: 0x73, b: 0x69 }; // --danger

const HIGHSEC_FLOOR = 0.5;
const HIGHSEC_CEIL = 1.0;
const LOW_NULL_FLOOR = -1.0;

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

/**
 * Colors a solar system's security status on the game's own scale: blue-green
 * across highsec (success at 0.5 blending to accent at 1.0), amber toward red
 * across lowsec and nullsec (warning approaching 0.5 from below, blending to
 * danger at -1.0 and beyond). The sharp jump mirrors the game client's own
 * highsec/lowsec boundary, not an interpolation artifact.
 *
 * Which side of that jump a system falls on is `securityBand`'s call, on the
 * rounded status — the same number the badge prints beside this color. Testing
 * the raw float here instead painted Ainsan (0.4730616, a highsec system shown
 * as 0.5) in the lowsec amber. Only the branch rounds: the gradient within each
 * band still interpolates the raw value, so neighbours stay distinguishable.
 */
export function securityStatusColor(security: number): string {
  if (securityBand(security) === 'highsec') {
    const t = clamp((security - HIGHSEC_FLOOR) / (HIGHSEC_CEIL - HIGHSEC_FLOOR), 0, 1);
    return lerpColor(SUCCESS, ACCENT, t);
  }
  const t = clamp((HIGHSEC_FLOOR - security) / (HIGHSEC_FLOOR - LOW_NULL_FLOOR), 0, 1);
  return lerpColor(WARNING, DANGER, t);
}
