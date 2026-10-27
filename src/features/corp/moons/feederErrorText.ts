import type { TFunction } from 'i18next';
import { callableErrorReason } from '@/lib/callableError';

const FAILED = 'corpTaxBook.moons.setup.failed';

/**
 * A refusal as text the player can read: the callable's `reason` mapped to a
 * `setup.failed` string, else the translated `fallbackKey`. Never the server's
 * raw English `message`; network and popup failures read as the fallback.
 */
export function callableErrorText(t: TFunction, e: unknown, fallbackKey: string): string {
  const reason = callableErrorReason(e);
  const known = reason === null ? '' : t(`${FAILED}.${reason}`, { defaultValue: '' });
  return known === '' ? t(fallbackKey) : known;
}

/** The setup flow's refusal text; an unknown reason reads as the generic "could not connect". */
export function feederErrorText(t: TFunction, e: unknown): string {
  return callableErrorText(t, e, `${FAILED}.generic`);
}

/** A local refusal carrying a `setup.failed` reason, so `callableErrorText` shows its text. */
export function refusal(reason: string): Error {
  return Object.assign(new Error(reason), { details: { reason } });
}
