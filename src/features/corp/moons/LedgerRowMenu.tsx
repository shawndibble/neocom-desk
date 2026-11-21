/**
 * The account ledger's row menu (right-click, touch-and-hold, ⋮). Each row offers only what
 * changes that row: a correction is edited or reversed (never deleted: the record stays, struck
 * through), a write-off is reversed, a Market adjustment is charged or changed, a payment is
 * marked not tax, a mined day gets its rate changed or its tax dismissed. A correction an issued
 * Statement billed is frozen (D22), so its item says so. Officers only: without edit rights the
 * row has no menu.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import type { LedgerEntry } from '@/engine/corpTaxBook/accountLedger';
import { useBook } from './useBook';

/** What a ledger row can open; each is bound by the Miner page, which owns the dialogs. */
export interface LedgerActions {
  editCorrection: (adjustmentId: string) => void;
  reverseCorrection: (adjustmentId: string) => void;
  reverseWriteOff: (writeOffId: string) => void;
  chargeShortfall: (entry: LedgerEntry) => void;
  changeForgiven: (entry: LedgerEntry) => void;
  markNotTax: (paymentId: string) => void;
  changeRate: (dayKey: string) => void;
  dismissDays: (dayKeys: readonly string[]) => void;
}

export function LedgerRowMenu({
  entry,
  actions,
  name,
  rateDays = [],
  dismissDays = [],
  onCloseAutoFocus,
  children,
}: {
  entry: LedgerEntry;
  actions: LedgerActions;
  /** Of a mined-day row's days, the ones whose rate can still be changed. */
  rateDays?: readonly string[];
  /** Of a mined-day row's days, the ones whose tax can still be dismissed (none paid or on a Statement). */
  dismissDays?: readonly string[];
  /** What the menu is named for assistive tech: the row's date and kind. */
  name: string;
  onCloseAutoFocus: (event: Event) => void;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const { canEdit } = useBook();
  if (!canEdit || entry.reversed || entry.reversal) return children;
  const item = (key: string, run: () => void) => (
    <MenuItem key={key} onSelect={run}>
      {t(`corpTaxBook.moons.ledger.menu.${key}`)}
    </MenuItem>
  );
  const items: ReactElement[] = [];
  if (entry.kind === 'correction' && entry.refId) {
    const id = entry.refId;
    items.push(
      item('correctionEdit', () => actions.editCorrection(id)),
      item('correctionReverse', () => actions.reverseCorrection(id))
    );
  } else if (entry.kind === 'writeOff' && entry.refId) {
    const id = entry.refId;
    items.push(item('writeOffReverse', () => actions.reverseWriteOff(id)));
  } else if (entry.kind === 'tolerance' && entry.forDate) {
    items.push(
      item('marketCharge', () => actions.chargeShortfall(entry)),
      item('marketEdit', () => actions.changeForgiven(entry))
    );
  } else if (entry.kind === 'payment' && entry.paymentId) {
    const id = entry.paymentId;
    items.push(item('notTax', () => actions.markNotTax(id)));
  } else if (entry.kind === 'day') {
    if (rateDays.length > 0) items.push(item('rate', () => actions.changeRate(rateDays[0]!)));
    if (dismissDays.length > 0) items.push(item('dismiss', () => actions.dismissDays(dismissDays)));
  }
  if (items.length === 0) return children;
  return (
    <RowActionsMenu name={name} onCloseAutoFocus={onCloseAutoFocus} items={<>{items}</>}>
      {children}
    </RowActionsMenu>
  );
}
