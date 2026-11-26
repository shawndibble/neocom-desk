import type { Translate } from '@/lib/translate';

export const flagWord = (value: number | boolean, t: Translate): string =>
  t(value ? 'fittings.statChange.yes' : 'fittings.statChange.no');
