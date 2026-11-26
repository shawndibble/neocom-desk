import type { TFunction } from 'i18next';
import { callableErrorReason } from '@/lib/callableError';
import { utcDay } from '@/engine/localDay';
import { lockDateFor } from '../../../../functions/src/corpTaxBookCheckpoint';
import { dateWithYear } from './moonsFormat';

const FAILED = 'corpTaxBook.moons.setup.failed';

export function callableErrorText(
  t: TFunction,
  e: unknown,
  fallbackKey: string,
  values: Record<string, unknown> = { date: dateWithYear(lockDateFor(utcDay())) }
): string {
  const reason = callableErrorReason(e);
  const known = reason === null ? '' : t(`${FAILED}.${reason}`, { ...values, defaultValue: '' });
  return known === '' ? t(fallbackKey) : known;
}

export function feederErrorText(t: TFunction, e: unknown): string {
  return callableErrorText(t, e, `${FAILED}.generic`);
}

export function refusal(reason: string): Error {
  return Object.assign(new Error(reason), { details: { reason } });
}
