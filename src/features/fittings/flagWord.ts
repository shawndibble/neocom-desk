import type { Translate } from '@/lib/translate';

/** A yes/no stat's 1 or 0 (`FLAG_STATS`) as the word shown. */
export const flagWord = (value: number | boolean, t: Translate): string =>
  t(value ? 'fittings.statChange.yes' : 'fittings.statChange.no');
