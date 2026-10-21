import type { TFunction } from 'i18next';

/**
 * A server refusal as text the player can read: the callable's `reason` mapped to
 * a `setup.failed` string, never the raw English `message`. Unknown reasons and
 * non-callable failures (network, popup) read as the generic one.
 */
export function feederErrorText(t: TFunction, e: unknown): string {
  const reason = (e as { details?: { reason?: unknown } } | null)?.details?.reason;
  return t(`corpTaxBook.moons.setup.failed.${typeof reason === 'string' ? reason : 'generic'}`, {
    defaultValue: t('corpTaxBook.moons.setup.failed.generic'),
  });
}
