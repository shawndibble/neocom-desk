/** Display helpers for the Market Browser's order tables. */
import { formatMarketIsk } from '@/lib/isk';
import { idReferenceKind } from '@/engine/market/attributeUnits';
import type { ResolvedOrderLocation } from '@/engine/market/orderBook';

const VOLUME_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** A whole-unit count, thousands-separated — order-book volume, traded volume, a day's order count. */
export function formatVolume(value: number): string {
  return VOLUME_FORMAT.format(value);
}

/** Below this a summed volume is float residue, not cargo. */
const M3_EPSILON = 1e-6;

/** A Trip Plan's whole m³; a real volume under one says "<1" rather than a misleading 0 or 1. */
export function formatTripM3(value: number): string {
  return value >= M3_EPSILON && value < 1 ? '<1' : formatVolume(Math.max(0, value));
}

const MEAN_COUNT_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

/**
 * A mean count. Keeps one decimal so a thin market reads `0.1` rather than a
 * flat `0`; whole numbers still print whole, so a busy item shows `450`.
 */
export function formatMeanCount(value: number): string {
  return MEAN_COUNT_FORMAT.format(value);
}

/** A day's traded price range, low to high, for the tooltip and the accessible table. */
export function formatPriceRange(lowest: number, highest: number): string {
  return `${formatMarketIsk(lowest)} \u2013 ${formatMarketIsk(highest)}`;
}

const ATTRIBUTE_VALUE_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

/**
 * An Item Detail attribute's raw ESI value, thousands-separated and trimmed to
 * 2 decimal places — except when `unit` says the value is an id nothing could
 * name (`engine/market/attributeUnits`). "1,872 groupID" reads like a
 * measurement; an identifier is printed as written.
 */
export function formatAttributeValue(value: number, unit?: string | null): string {
  if (idReferenceKind(unit) !== null) return String(value);
  return ATTRIBUTE_VALUE_FORMAT.format(value);
}

/**
 * An order's location as flat text — "Station · System (0.9)" — for the
 * copy-location context-menu action and the CSV export. The on-screen
 * Location column deliberately shows the station name alone (a station name
 * already carries its system); this longer form is for a location leaving
 * the app, where the reader has no book around it for context. Falls back to
 * the caller's unknown-structure label, the same way `LocationCell` does.
 */
export function formatOrderLocationText(
  location: ResolvedOrderLocation,
  unknownStructureLabel: string
): string {
  return `${location.stationName ?? unknownStructureLabel} · ${location.systemName} (${location.security.toFixed(1)})`;
}
