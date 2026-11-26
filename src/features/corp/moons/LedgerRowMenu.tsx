import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import type { PayeeLedgerRow } from '@/engine/miningTax/payeeLedger';
import { isLocked } from '../../../../functions/src/corpTaxBookCheckpoint';
import { useBook } from './useBook';

export interface LedgerActions {
  editCorrection: (adjustmentId: string) => void;
  reverseCorrection: (adjustmentId: string) => void;
  reverseWriteOff: (writeOffId: string) => void;
  chargeShortfall: (day: { date: string; amount: number }) => void;
  changeForgiven: (day: { date: string; amount: number }) => void;
  markNotTax: (paymentId: string) => void;
  reassignPayment: (paymentId: string) => void;
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
  entry: PayeeLedgerRow;
  actions: LedgerActions;
  rateDays?: readonly string[];
  dismissDays?: readonly string[];
  name: string;
  onCloseAutoFocus: (event: Event) => void;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const { canEdit, view } = useBook();
  if (!canEdit || entry.reversed || entry.reversal || isLocked(entry.date, view.input.now))
    return children;
  const item = (key: string, run: () => void) => (
    <MenuItem key={key} onSelect={run}>
      {t(`corpTaxBook.moons.ledger.menu.${key}`)}
    </MenuItem>
  );
  const items: ReactElement[] = [];
  const e = entry;
  if (e.kind === 'charge' && e.charge.kind === 'correction') {
    const id = e.charge.id;
    items.push(
      item('correctionEdit', () => actions.editCorrection(id)),
      item('correctionReverse', () => actions.reverseCorrection(id))
    );
  } else if (e.kind === 'writeOff' && e.cause === 'officer') {
    const id = e.key.slice('writeOff:'.length);
    items.push(item('writeOffReverse', () => actions.reverseWriteOff(id)));
  } else if (e.kind === 'writeOff' && e.cause === 'tolerance' && e.days.length === 1) {
    const day = e.days[0]!;
    items.push(
      item('marketCharge', () => actions.chargeShortfall(day)),
      item('marketEdit', () => actions.changeForgiven(day))
    );
  } else if (e.kind === 'payment') {
    const id = e.payment.id;
    items.push(
      item('notTax', () => actions.markNotTax(id)),
      item('reassign', () => actions.reassignPayment(id))
    );
  } else if (e.kind === 'charge' && rateDays.length > 0 && dismissDays.length > 0) {
    items.push(
      item('rate', () => actions.changeRate(rateDays[0]!)),
      item('dismiss', () => actions.dismissDays(dismissDays))
    );
  }
  if (items.length === 0) return children;
  return (
    <RowActionsMenu name={name} onCloseAutoFocus={onCloseAutoFocus} items={<>{items}</>}>
      {children}
    </RowActionsMenu>
  );
}
