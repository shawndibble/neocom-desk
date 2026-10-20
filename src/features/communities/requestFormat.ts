import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';
import type { RequestStatus } from '@/engine/communities/requests';

type Translate = (key: string, opts?: Record<string, unknown>) => string;
import { createNumberFormat } from '@/lib/numberLocale';

const quantityFormat = createNumberFormat({});

/** A quantity or count, thousands-separated. */
export const formatQuantity = (value: number) => quantityFormat(value);

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

/**
 * How long a Request has left, in the wording of the surface asking: `expired`
 * once past, the `underDay` key under a day, else the `days` key with the count.
 */
export function describeExpiry(
  expiresAt: number,
  now: number,
  t: Translate,
  keys: { underDay: string; days: string }
): string {
  if (expiresAt <= now) return t('communities.board.status.expired');
  const days = daysLeft(expiresAt, now);
  return days === 0 ? t(keys.underDay) : t(keys.days, { count: days });
}

/** `29d left`, `<1d left`, or `expired`: the board's remaining-time text. */
export const formatLeft = (expiresAt: number, now: number, t: Translate): string =>
  describeExpiry(expiresAt, now, t, {
    underDay: 'communities.board.leftUnderDay',
    days: 'communities.board.left',
  });

export const STATUS_TONE: Record<RequestStatus, string> = {
  open: 'text-text-dim',
  pledged: 'text-accent',
  partDelivered: 'text-warning',
  delivered: 'text-success',
  closed: 'text-text-dim',
  expired: 'text-text-dim',
};
