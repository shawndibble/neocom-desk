import type { DayRow } from '@/engine/corpTaxBook/bookView';

/**
 * A day's rate can be overridden until it is on a Statement (D31). A running account's day that
 * is already paid is one: the override reprices it and the payment it no longer needs becomes credit.
 */
export const canOverrideDay = (d: DayRow) =>
  d.statementId === undefined && d.status !== 'dismissed' && d.status !== 'written-off';
