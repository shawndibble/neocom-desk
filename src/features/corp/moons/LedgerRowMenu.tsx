/**
 * The Miner ledger's row menu (right-click, touch-and-hold, ⋮), on the one Payee ledger's rows.
 * Each row offers only what changes that row: a correction is edited or reversed (never deleted:
 * the record stays, struck through), a write-off is reversed, a forgiven shortfall is charged or
 * changed, a payment is marked not tax or moved to another Miner, a mined day gets its rate
 * changed or its tax dismissed. Officers only: without edit rights the row has no menu, and a
 * row dated before the lock date has none either (decision 20261120-235011, "a lock date").
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, RowActionsMenu } from '@/components/ui';
import type { PayeeLedgerRow } from '@/engine/miningTax/payeeLedger';
import { isLocked } from '../../../../functions/src/corpTaxBookCheckpoint';
import { useBook } from './useBook';

/** What a ledger row can open; each is bound by the Miner page, which owns the dialogs. */
export interface LedgerActions {
  editCorrection: (adjustmentId: string) => void;
  reverseCorrection: (adjustmentId: string) => void;
  reverseWriteOff: (writeOffId: string) => void;
  /** A shortfall the tolerance forgave on one day: what it forgave. */
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
  /** Of a mined-day row's days, the ones whose rate can still be changed. */
  rateDays?: readonly string[];
  /** Of a mined-day row's days, the ones whose tax can still be dismissed (none paid or on a Late notice). */
  dismissDays?: readonly string[];
  /** What the menu is named for assistive tech: the row's date and kind. */
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
    // One day's shortfall: a row that closed several days lists them in its detail instead.
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
    // A day with only one of these (a paid day can only be repriced) gets no menu: one action
    // never earns one (DESIGN.md §6c), and the page's own menu reaches both, and the day tables'.
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
