/** Display helpers for the Market Browser's order tables. */
import type { ResolvedOrderLocation } from '@/engine/market/orderBook';

const VOLUME_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** Order-book volume, thousands-separated. */
export function formatVolume(value: number): string {
  return VOLUME_FORMAT.format(value);
}

const ATTRIBUTE_VALUE_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

/** An Item Detail attribute's raw ESI value, thousands-separated and trimmed to 2 decimal places. */
export function formatAttributeValue(value: number): string {
  return ATTRIBUTE_VALUE_FORMAT.format(value);
}

/**
 * An order's location as flat text — "Station · System (0.9)" — for the
 * copy-location context-menu action and the station-filter banner. Falls
 * back to the caller's unknown-structure label, the same way `LocationCell`
 * does for display.
 */
export function formatOrderLocationText(
  location: ResolvedOrderLocation,
  unknownStructureLabel: string
): string {
  return `${location.stationName ?? unknownStructureLabel} · ${location.systemName} (${location.security.toFixed(1)})`;
}
