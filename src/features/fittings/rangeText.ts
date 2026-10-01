/**
 * How the stats column reads a distance, and a weapon's or module's reach:
 * the way the game's HUD tooltip says it, so a pilot sees the numbers they
 * already know from space.
 */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Metres as km to one decimal — the number alone, for a label to place. */
export function kmValue(metres: number): string {
  return (metres / 1000).toFixed(1);
}

/**
 * Where it hits at full accuracy, then where it's down to about half —
 * optimal plus falloff, as the HUD tooltip has it, not the falloff band
 * alone. With no falloff (a missile, a scrambler) a single range.
 */
export function rangeLines(t: Translate, optimal: number, falloff: number): string[] {
  if (falloff <= 0) return [t('fittings.stats.range.single', { value: kmValue(optimal) })];
  return [
    t('fittings.stats.range.optimal', { value: kmValue(optimal) }),
    t('fittings.stats.range.falloff', { value: kmValue(optimal + falloff) }),
  ];
}
