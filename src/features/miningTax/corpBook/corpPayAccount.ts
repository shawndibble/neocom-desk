import type { DivisionNames } from '@/engine/corpTaxBook/divisionNames';
import { otherDivisions } from '@/engine/corpTaxBook/uncounted';
import type { Translate } from '@/lib/translate';

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

export function corpPayAccounts(
  divisions: readonly number[],
  names: Readonly<DivisionNames> | undefined,
  t: Translate
): string[] {
  return divisions.map((d) => corpPayAccount(d, names, t));
}

export function readsEveryDivision(divisions: readonly number[]): boolean {
  return otherDivisions(divisions).length === 0;
}
