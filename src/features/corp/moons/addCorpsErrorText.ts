import type { TFunction } from 'i18next';

const FAILED = 'corpTaxBook.moons.addCorps.failed';

export function addCorpsErrorText(t: TFunction, reason: string | null | undefined): string {
  const known = reason ? t(`${FAILED}.${reason}`, { defaultValue: '' }) : '';
  return known === '' ? t(`${FAILED}.unknown`) : known;
}
