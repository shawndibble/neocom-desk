/**
 * The Miners table's row menu (right-click, touch-and-hold, ⋮): Show info for the main
 * character, then Record payment, Dismiss tax and Mark not tax. Open page is the opened row's
 * link, so it is not repeated here; Send reminder lives on the Miner's page header. Mark not tax
 * acts on the latest payment with tax in it, and the item names it. Officers only: without edit
 * rights the row has no actions, so no menu.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DisabledMenuItem, MenuItem, RowActionsMenu } from '@/components/ui';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { EntityShowInfoMenuItem } from '../corpRowMenus';
import { useBook } from './useBook';
import { isk, shortDate } from './moonsFormat';

export function MinerRowMenu({
  miner,
  onRecord,
  onDismiss,
  onNotTax,
  onCloseAutoFocus,
  onOpenChange,
  children,
}: {
  miner: MinerRow;
  /** Each opens its dialog after the menu closes (`useOpenAfterMenu`'s `run`, bound by the caller). */
  onRecord: (miner: MinerRow) => void;
  onDismiss: (miner: MinerRow) => void;
  /** Given the payment to mark: the Miner's latest one that still has tax in it. */
  onNotTax: (miner: MinerRow, paymentId: string) => void;
  onCloseAutoFocus: (event: Event) => void;
  onOpenChange?: (open: boolean) => void;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const { view, names, canEdit } = useBook();
  if (!canEdit) return children;
  const name = names.character(miner.mainCharacterId);
  const payment = view.internals.byMiner
    .get(miner.id)
    ?.payments.filter((p) => p.amount - (p.notTaxAmount ?? 0) > 0)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return (
    <RowActionsMenu
      name={name}
      onCloseAutoFocus={onCloseAutoFocus}
      onOpenChange={onOpenChange}
      items={
        <>
          <EntityShowInfoMenuItem entity={{ kind: 'character', id: miner.mainCharacterId }} />
          <MenuItem onSelect={() => onRecord(miner)}>
            {t('corpTaxBook.moons.miner.record')}
          </MenuItem>
          <MenuItem onSelect={() => onDismiss(miner)}>
            {t('corpTaxBook.moons.miner.dismissAll')}
          </MenuItem>
          {payment ? (
            <MenuItem onSelect={() => onNotTax(miner, payment.id)}>
              <span>
                {t('corpTaxBook.moons.payment.markNotTaxMenu')}
                {/* The item acts on the latest payment with tax in it: say which, in view. */}
                <span className="block text-xs text-text-dim">
                  {t('corpTaxBook.moons.payment.markNotTaxTarget', {
                    date: shortDate(payment.at),
                    amount: isk(payment.amount),
                  })}
                </span>
              </span>
            </MenuItem>
          ) : (
            <DisabledMenuItem reason={t('corpTaxBook.moons.payment.markNotTaxNone')}>
              {t('corpTaxBook.moons.payment.markNotTaxMenu')}
            </DisabledMenuItem>
          )}
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
