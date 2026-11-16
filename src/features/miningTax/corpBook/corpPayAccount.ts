import type { DivisionNames } from '@/engine/corpTaxBook/divisionNames';
import { otherDivisions } from '@/engine/corpTaxBook/uncounted';
import type { Translate } from '@/lib/translate';

/**
 * The Account a member picks in EVE's Transfer ISK window for a corp book's division: the
 * corp's own name for it when a Director's visit stored one (#6161), else "Master Wallet" for
 * division 1 and the numbered division otherwise.
 */
export function corpPayAccount(
  division: number,
  names: Readonly<DivisionNames> | undefined,
  t: Translate
): string {
  const name = names?.[division];
  if (name) return name;
  return division === 1
    ? t('miningTax.corpBook.pay.masterWallet')
    : t('miningTax.corpBook.pay.division', { division });
}

/**
 * Every Account the book reads donations from, in division order: as `corpPayAccount`, but an
 * unnamed division is just "Division N" — the "(number N in the list)" hint repeated for each
 * of several reads as noise.
 */
export function corpPayAccounts(
  divisions: readonly number[],
  names: Readonly<DivisionNames> | undefined,
  t: Translate
): string[] {
  return divisions.map(
    (d) =>
      names?.[d] ||
      (d === 1
        ? t('miningTax.corpBook.pay.masterWallet')
        : t('miningTax.corpBook.pay.divisionShort', { division: d }))
  );
}

/** Whether the book reads all of the corp's wallet divisions, so no donation can miss it. */
export function readsEveryDivision(divisions: readonly number[]): boolean {
  return otherDivisions(divisions).length === 0;
}
