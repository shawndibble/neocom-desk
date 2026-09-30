const VOLUME_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const TINY_VOLUME_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 4 });

/**
 * A volume in m³, number only (e.g. "0.01", "470,000") — for a cell whose
 * header already names the unit. Two decimals so a small item is legible
 * without trailing-zero noise; a positive volume below 0.01 keeps four so it
 * never rounds to "0".
 */
export function formatCubicMetres(value: number): string {
  const format = value > 0 && value < 0.01 ? TINY_VOLUME_FORMAT : VOLUME_FORMAT;
  return format.format(value);
}

/** A per-unit item volume with its unit (e.g. "0.01 m³", "470,000 m³") — `formatCubicMetres` plus the unit. */
export function formatUnitVolume(value: number): string {
  return `${formatCubicMetres(value)} m³`;
}
