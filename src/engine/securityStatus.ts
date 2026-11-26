export type SecurityBand = 'highsec' | 'lowsec' | 'nullsec';

import { clamp } from './math';

export function shownSecurity(security: number): number {
  return Math.round(security * 10) / 10;
}

export function securityBand(security: number): SecurityBand {
  const shown = shownSecurity(security);
  if (shown >= 0.5) return 'highsec';
  if (shown >= 0.1) return 'lowsec';
  return 'nullsec';
}

const SUCCESS = { r: 0x5f, g: 0xd5, b: 0x84 };
const ACCENT = { r: 0x57, g: 0xc7, b: 0xf4 };
const WARNING = { r: 0xf5, g: 0xb9, b: 0x4a };
const DANGER = { r: 0xff, g: 0x73, b: 0x69 };

const HIGHSEC_FLOOR = 0.5;
const HIGHSEC_GREEN = 0.7;
const HIGHSEC_CEIL = 1.0;
const LOWSEC_CEIL = 0.4;
const LOWSEC_FLOOR = 0.1;
const LOWSEC_BLEND_TOP = 0.4;
const LOWSEC_BLEND_BOTTOM = 0.6;

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function toHex(channel: number): string {
  return clamp(channel, 0, 255).toString(16).padStart(2, '0');
}

export function lerpColor(a: { r: number; g: number; b: number }, b: typeof a, t: number): string {
  return `#${toHex(lerpChannel(a.r, b.r, t))}${toHex(lerpChannel(a.g, b.g, t))}${toHex(lerpChannel(a.b, b.b, t))}`;
}

const DANGER_HEX = lerpColor(DANGER, DANGER, 0);

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
