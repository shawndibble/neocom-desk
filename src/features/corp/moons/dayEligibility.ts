import type { DayRow } from '@/engine/corpTaxBook/bookView';
import { isLocked } from '../../../../functions/src/corpTaxBookCheckpoint';

/**
 * A day's rate can be overridden until a late notice lists it (D31; the server refuses a record
 * rate on a day a notice covers) and while it is not before the lock date. A day already paid is
 * one: the override reprices it and the payment it no longer needs becomes credit.
 */
export const canOverrideDay = (d: DayRow, now: string) =>
  d.noticeId === undefined && d.status !== 'dismissed' && !isLocked(d.date, now);
