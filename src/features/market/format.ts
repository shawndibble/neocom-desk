import { formatMarketIsk } from '@/lib/isk';
import { fixed1, fixedFormat } from '@/lib/fixedFormat';
import { shownSecurity } from '@/engine/securityStatus';
import { createNumberFormat } from '@/lib/numberLocale';
import { idReferenceKind } from '@/engine/market/attributeUnits';
import type { ResolvedOrderLocation } from '@/engine/market/orderBook';

const VOLUME_FORMAT = createNumberFormat({ maximumFractionDigits: 0 });

export function formatVolume(value: number): string {
  return VOLUME_FORMAT(value);
}

export function formatSignedPct(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? '+' : ''}${fixedFormat(digits)(rounded)}%`;
}

export function formatVsMedianPct(pct: number): string {
  const rounded = Math.round(pct);
  return `${rounded > 0 ? '+' : rounded < 0 ? '\u2212' : ''}${Math.abs(rounded)}%`;
}

const M3_EPSILON = 1e-6;

export function formatTripM3(value: number): string {
  return value >= M3_EPSILON && value < 1 ? '<1' : formatVolume(Math.max(0, value));
}

const MEAN_COUNT_FORMAT = createNumberFormat({ maximumFractionDigits: 1 });

export function formatMeanCount(value: number): string {
  return MEAN_COUNT_FORMAT(value);
}

export function formatPriceRange(lowest: number, highest: number): string {
  return `${formatMarketIsk(lowest)} \u2013 ${formatMarketIsk(highest)}`;
}

const ATTRIBUTE_VALUE_FORMAT = createNumberFormat({ maximumFractionDigits: 2 });

export function formatAttributeValue(value: number, unit?: string | null): string {
  if (idReferenceKind(unit) !== null) return String(value);
  return ATTRIBUTE_VALUE_FORMAT(value);
}

export function formatOrderLocationText(
  location: ResolvedOrderLocation,
  unknownStructureLabel: string
): string {
  return `${location.stationName ?? unknownStructureLabel} · ${location.systemName} (${fixed1(shownSecurity(location.security))})`;
}

interface HoldFigures {
  capacityM3: number;
  usedM3: number;
}

export const shownUsedM3 = (holds: readonly HoldFigures[]): number =>
  holds.reduce((sum, h) => sum + Math.round(h.usedM3), 0);

export const shownFreeM3 = (holds: readonly HoldFigures[]): number =>
  holds.reduce((sum, h) => sum + Math.max(0, Math.round(h.capacityM3) - Math.round(h.usedM3)), 0);

export function shownAddedM3(
  before: readonly HoldFigures[],
  after: readonly HoldFigures[],
  rawM3: number
): number {
  const moved = shownUsedM3(after) - shownUsedM3(before);
  return moved === 0 ? rawM3 : moved;
}
