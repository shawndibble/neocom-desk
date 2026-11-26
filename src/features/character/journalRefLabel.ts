import { PLEX_BOUGHT_KEY, PLEX_SOLD_KEY } from '@/engine/journalNetting';
import { humanizeRefType } from '@/features/character/format';

export function journalRefLabel(key: string, t: (key: string) => string): string {
  if (key === PLEX_BOUGHT_KEY) return t('wallet.refTypePlexBought');
  if (key === PLEX_SOLD_KEY) return t('wallet.refTypePlexSold');
  return humanizeRefType(key);
}
