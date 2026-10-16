import { PLEX_BOUGHT_KEY, PLEX_SOLD_KEY } from '@/engine/journalNetting';
import { humanizeRefType } from '@/features/character/format';

/** A journal ref-type key as the player reads it: PLEX rows have their own names. */
export function journalRefLabel(key: string, t: (key: string) => string): string {
  if (key === PLEX_BOUGHT_KEY) return t('wallet.refTypePlexBought');
  if (key === PLEX_SOLD_KEY) return t('wallet.refTypePlexSold');
  return humanizeRefType(key);
}
