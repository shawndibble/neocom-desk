/**
 * The wallet journal's Description cell: ESI's own description, plus — when
 * the line is a market fill we have loaded — the item it bought or sold, with
 * its icon, linked to that item's Market listing.
 *
 * The item line's tooltip carries the fill itself (side, quantity × unit
 * price), which is what the journal amount alone can't say. Not `openOnTap`:
 * a tap on the link navigates, so touch-and-hold stays the way to read it
 * (see `Tooltip`).
 */
import { useTranslation } from 'react-i18next';
import { Tooltip, TypeIcon } from '@/components/ui';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { formatIsk } from '@/lib/isk';
import { transactionTotal } from './walletTransactionsCsv';

interface JournalDescriptionCellProps {
  description: string;
  transaction: WalletTransactionCommon | undefined;
  itemName: string;
}

export function JournalDescriptionCell({
  description,
  transaction,
  itemName,
}: JournalDescriptionCellProps) {
  const { t } = useTranslation();
  if (!transaction) return <>{description}</>;
  const fill = t(transaction.is_buy ? 'wallet.journalItemBought' : 'wallet.journalItemSold', {
    quantity: transaction.quantity.toLocaleString(),
    unitPrice: formatIsk(transaction.unit_price, 2),
    total: formatIsk(Math.abs(transactionTotal(transaction)), 2),
  });
  return (
    <div className="flex flex-col gap-1">
      <span>{description}</span>
      <Tooltip content={fill}>
        <MarketItemLink
          typeId={transaction.type_id}
          className="inline-flex w-fit items-center gap-1.5 text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <TypeIcon typeId={transaction.type_id} size={32} className="h-4 w-4 shrink-0" />
          <span>
            {itemName}
            <span className="text-text-dim"> ×{transaction.quantity.toLocaleString()}</span>
          </span>
        </MarketItemLink>
      </Tooltip>
    </div>
  );
}
