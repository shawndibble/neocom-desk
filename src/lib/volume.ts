const VOLUME_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const TINY_VOLUME_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 4 });

/**
 * A per-unit item volume with its unit (e.g. "0.01 m³", "470,000 m³"). Two
 * decimals so a small item is legible without trailing-zero noise; a positive
 * volume below 0.01 keeps four so it never rounds to "0 m³".
 */
export function formatUnitVolume(value: number): string {
  const format = value > 0 && value < 0.01 ? TINY_VOLUME_FORMAT : VOLUME_FORMAT;
  return `${format.format(value)} m³`;
}
