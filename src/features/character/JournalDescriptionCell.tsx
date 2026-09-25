/**
 * The wallet journal's Description cell: ESI's own description, plus three
 * optional extras — a dim `reason` line (issue #1721, e.g. a corp member's
 * "moon tax Aug" memo), a link to the contract behind a contract-reward row,
 * and — when the line is a market fill we have loaded — the item it bought
 * or sold, with its icon, linked to that item's Market listing.
 *
 * The item line's tooltip carries the fill itself (side, quantity × unit
 * price), which is what the journal amount alone can't say. Not `openOnTap`:
 * a tap on the link navigates, so touch-and-hold stays the way to read it
 * (see `Tooltip`).
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tooltip, TypeIcon } from '@/components/ui';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';
import { formatIsk } from '@/lib/isk';
import { transactionTotal } from './walletTransactionsCsv';

interface JournalDescriptionCellProps {
  entry: WalletJournalEntry;
  transaction: WalletTransactionCommon | undefined;
  itemName: string;
}

export function JournalDescriptionCell({
  entry,
  transaction,
  itemName,
}: JournalDescriptionCellProps) {
  const { t } = useTranslation();
  const contractId = entry.context_id_type === 'contract_id' ? entry.context_id : undefined;
  if (!transaction && !entry.reason && contractId === undefined) return <>{entry.description}</>;
  const fill = transaction
    ? t(transaction.is_buy ? 'wallet.journalItemBought' : 'wallet.journalItemSold', {
        quantity: transaction.quantity.toLocaleString(),
        unitPrice: formatIsk(transaction.unit_price, 2),
        total: formatIsk(Math.abs(transactionTotal(transaction)), 2),
      })
    : null;
  return (
    <div className="flex flex-col gap-1">
      <span>{entry.description}</span>
      {entry.reason && <span className="text-text-dim">{entry.reason}</span>}
      {contractId !== undefined && (
        <Link
          to={`/contracts/history?${HIGHLIGHT_PARAM}=${contractId}`}
          className="w-fit text-text-dim hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t('wallet.journalContractLink')}
        </Link>
      )}
      {transaction && fill && (
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
      )}
    </div>
  );
}
