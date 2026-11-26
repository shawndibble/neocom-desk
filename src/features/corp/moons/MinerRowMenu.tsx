import { useTimeZone } from '@/lib/timeFormat';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DisabledMenuItem, MenuItem, RowActionsMenu } from '@/components/ui';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { EntityShowInfoMenuItem } from '../corpRowMenus';
import { useBook } from './useBook';
import { atDate, isk } from './moonsFormat';

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
  onRecord: (miner: MinerRow) => void;
  onDismiss: (miner: MinerRow) => void;
  onNotTax: (miner: MinerRow, paymentId: string) => void;
  onCloseAutoFocus: (event: Event) => void;
  onOpenChange?: (open: boolean) => void;
  children: ReactElement;
}) {
  const zone = useTimeZone();
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
                {t('corpTaxBook.moons.payment.markNotTax')}
                <span className="block text-xs text-text-dim">
                  {t('corpTaxBook.moons.payment.markNotTaxTarget', {
                    date: atDate(payment.at, zone),
                    amount: isk(payment.amount),
                  })}
                </span>
              </span>
            </MenuItem>
          ) : (
            <DisabledMenuItem reason={t('corpTaxBook.moons.payment.markNotTaxNone')}>
              {t('corpTaxBook.moons.payment.markNotTax')}
            </DisabledMenuItem>
          )}
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
