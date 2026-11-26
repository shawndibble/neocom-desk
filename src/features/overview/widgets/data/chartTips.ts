import { formatDateOnly } from '@/lib/timestamp';
import type { Translate } from '@/lib/translate';

const TIP = 'overview.widgets.chart.tip';

export type TipUnit = 'day' | 'week' | 'hour';

export function rollingTitles(t: Translate, unit: TipUnit, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const age = count - 1 - i;
    return age === 0 ? t(`${TIP}.${unit}.now`) : t(`${TIP}.${unit}.ago`, { count: age });
  });
}

export function dayTitle(isoDay: string): string {
  return formatDateOnly(new Date(`${isoDay}T00:00:00Z`), 'UTC');
}

export function signTone(value: number): 'good' | 'bad' | undefined {
  return value > 0 ? 'good' : value < 0 ? 'bad' : undefined;
}
