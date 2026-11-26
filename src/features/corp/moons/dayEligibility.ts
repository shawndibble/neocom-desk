import type { DayRow } from '@/engine/corpTaxBook/bookView';
import { isLocked } from '../../../../functions/src/corpTaxBookCheckpoint';

export const canOverrideDay = (d: DayRow, now: string) =>
  d.noticeId === undefined && d.status !== 'dismissed' && !isLocked(d.date, now);
