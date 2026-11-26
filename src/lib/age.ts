import type { Translate } from '@/lib/translate';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../../functions/src/timeConstants';

export { DAY_MS, HOUR_MS, MINUTE_MS };

export function formatAge(ms: number, t: Translate): string {
  if (ms < MINUTE_MS) return t('common.age.justNow');
  if (ms < HOUR_MS) return t('common.age.minutes', { count: Math.floor(ms / MINUTE_MS) });
  if (ms < DAY_MS) return t('common.age.hours', { count: Math.floor(ms / HOUR_MS) });
  return t('common.age.days', { count: Math.floor(ms / DAY_MS) });
}
