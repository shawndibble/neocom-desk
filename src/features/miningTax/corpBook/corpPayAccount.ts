import type { DivisionNames } from '@/engine/corpTaxBook/divisionNames';
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
