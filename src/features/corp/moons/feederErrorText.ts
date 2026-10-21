import type { TFunction } from 'i18next';

const reasonOf = (e: unknown): string | null => {
  const reason = (e as { details?: { reason?: unknown } } | null)?.details?.reason;
  return typeof reason === 'string' ? reason : null;
};

/**
 * A server refusal as text the player can read: the callable's `reason` mapped to
 * a `setup.failed` string, never the raw English `message`. Unknown reasons and
 * non-callable failures (network, popup) read as the generic one.
 */
export function feederErrorText(t: TFunction, e: unknown): string {
  const reason = reasonOf(e);
  return t(`corpTaxBook.moons.setup.failed.${reason ?? 'generic'}`, {
    defaultValue: t('corpTaxBook.moons.setup.failed.generic'),
  });
}

/**
 * The mapped text when the refusal carries a reason we have a string for, else
 * null so the caller keeps its own fallback.
 */
export function knownReasonText(t: TFunction, e: unknown): string | null {
  const reason = reasonOf(e);
  if (reason === null) return null;
  const text = t(`corpTaxBook.moons.setup.failed.${reason}`, { defaultValue: '' });
  return text === '' ? null : text;
}
