import { fixed1 } from '@/lib/fixedFormat';
import type { Translate } from '@/lib/translate';

export function kmValue(metres: number): string {
  return fixed1(metres / 1000);
}

export function rangeLines(t: Translate, optimal: number, falloff: number): string[] {
  if (falloff <= 0) return [t('fittings.stats.range.single', { value: kmValue(optimal) })];
  return [
    t('fittings.stats.range.optimal', { value: kmValue(optimal) }),
    t('fittings.stats.range.falloff', { value: kmValue(optimal + falloff) }),
  ];
}
