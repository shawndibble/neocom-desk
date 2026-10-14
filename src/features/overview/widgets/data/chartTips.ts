/**
 * Hover readouts for the Overview charts' points: the titles ("3 days ago",
 * "Oct 8") and the tone a signed figure reads in. A kind's builder fills in the
 * figures; the strings are translated here so a chart only draws them.
 */
import { formatDateOnly } from '@/lib/timestamp';
import type { Translate } from './types';

const TIP = 'overview.widgets.chart.tip';

/** The unit a rolling bucket spans. */
export type TipUnit = 'day' | 'week' | 'hour';

/**
 * Titles for `count` buckets that end at "now", oldest first: the last is
 * "Today" / "This week" / "This hour", and the rest count back from it.
 */
export function rollingTitles(t: Translate, unit: TipUnit, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const age = count - 1 - i;
    return age === 0 ? t(`${TIP}.${unit}.now`) : t(`${TIP}.${unit}.ago`, { count: age });
  });
}

/** A calendar day (`YYYY-MM-DD`, EVE time) as a short date. */
export function dayTitle(isoDay: string): string {
  return formatDateOnly(new Date(`${isoDay}T00:00:00Z`), 'UTC');
}

/** Green for a gain, red for a loss, plain for zero. */
export function signTone(value: number): 'good' | 'bad' | undefined {
  return value > 0 ? 'good' : value < 0 ? 'bad' : undefined;
}
