import type { TFunction } from 'i18next';

const FAILED = 'corpTaxBook.moons.addCorps.failed';

/**
 * A refusal `reason` (from `addOwnCorpFeederRemote` or a thrown callable) as
 * text the player can read. Never the server's own message: an unrecognised
 * reason reads as the generic `unknown` text.
 */
export function addCorpsErrorText(t: TFunction, reason: string | null | undefined): string {
  const known = reason ? t(`${FAILED}.${reason}`, { defaultValue: '' }) : '';
  return known === '' ? t(`${FAILED}.unknown`) : known;
}
