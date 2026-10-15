import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';
import type { RequestStatus } from '@/engine/communities/requests';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const quantityFormat = new Intl.NumberFormat('en');

/** A quantity or count, thousands-separated. */
export const formatQuantity = (value: number) => quantityFormat.format(value);

/** `2h`, `3d`: how long ago, no "ago" (the board column says it in its header). */
export function formatShortAge(ms: number, t: Translate): string {
  if (ms < MINUTE_MS) return t('communities.board.age.now');
  if (ms < HOUR_MS)
    return t('communities.board.age.minutes', { count: Math.floor(ms / MINUTE_MS) });
  if (ms < DAY_MS) return t('communities.board.age.hours', { count: Math.floor(ms / HOUR_MS) });
  return t('communities.board.age.days', { count: Math.floor(ms / DAY_MS) });
}

/** Whole days until `expiresAt`, 0 once under a day, never negative. */
export function daysLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.floor((expiresAt - now) / DAY_MS));
}

/** `29d left`, `<1d left`, or `expired`: the board's remaining-time text. */
export function formatLeft(expiresAt: number, now: number, t: Translate): string {
  if (expiresAt <= now) return t('communities.board.status.expired');
  const days = daysLeft(expiresAt, now);
  return days === 0
    ? t('communities.board.leftUnderDay')
    : t('communities.board.left', { count: days });
}

export const STATUS_TONE: Record<RequestStatus, string> = {
  open: 'text-text-dim',
  pledged: 'text-accent',
  partDelivered: 'text-warning',
  delivered: 'text-success',
  closed: 'text-text-dim',
  expired: 'text-text-dim',
};
