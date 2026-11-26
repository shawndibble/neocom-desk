import { formatCount } from '@/lib/formatCount';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import { Button, Tooltip, TypeIcon } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';
import { CharacterLink, ItemInfoLink } from '@/features/entities';
import { HIGHLIGHT_PARAM } from '@/lib/highlightParam';
import { formatIsk } from '@/lib/isk';
import { useInsuranceLossModalStore } from '@/stores/insuranceLossModal';
import { BountyFactionSummary } from './BountyFactionSummary';
import { bountyKillsOf } from './bountyKills';
import { dailyGoalMessageIdOf, dailyGoalName } from './dailyGoal';
import { transactionTotal } from './walletTransactionsCsv';

export interface MiningTaxEntryLink {
  href: string;
  date: string;
  taxOwed: number;
}

interface JournalDescriptionCellProps {
  entry: WalletJournalEntry;
  transaction: WalletTransactionCommon | undefined;
  itemName: string;
  miningTaxEntries?: readonly MiningTaxEntryLink[];
  lossCharacterId?: number;
  player?: { id: number; name: string };
}

function describedWithPlayer(
  description: string | undefined,
  player: JournalDescriptionCellProps['player']
) {
  if (!description || !player?.name) return description;
  const at = description.indexOf(player.name);
  if (at < 0) return description;
  return (
    <>
      {description.slice(0, at)}
      <CharacterLink id={player.id}>{player.name}</CharacterLink>
      {description.slice(at + player.name.length)}
    </>
  );
}

export function JournalDescriptionCell({
  entry,
  transaction,
  itemName,
  miningTaxEntries,
  lossCharacterId,
  player,
}: JournalDescriptionCellProps) {
  const { t } = useTranslation();
  const openLoss = useInsuranceLossModalStore((state) => state.open);
  const canViewLoss =
    lossCharacterId !== undefined && entry.ref_type === 'insurance' && (entry.amount ?? 0) > 0;
  const contractId = entry.context_id_type === 'contract_id' ? entry.context_id : undefined;
  const kills = useMemo(() => bountyKillsOf(entry), [entry]);
  const goalId = dailyGoalMessageIdOf(entry);
  if (goalId !== null) {
    const name = dailyGoalName(goalId, t);
    if (name) return <>{name}</>;
    return (
      <HintText content={t('wallet.dailyGoalIdTitle', { id: goalId })}>
        {t('wallet.dailyGoal')}
      </HintText>
    );
  }
  if (
    !transaction &&
    !entry.reason &&
    contractId === undefined &&
    !miningTaxEntries?.length &&
    !canViewLoss
  ) {
    return <>{describedWithPlayer(entry.description, player)}</>;
  }
  const soleTaxEntry = miningTaxEntries?.length === 1 ? miningTaxEntries[0] : undefined;
  const reasonIsTaxLink = Boolean(soleTaxEntry && entry.reason && !kills);
  const fill = transaction
    ? t(transaction.is_buy ? 'wallet.journalItemBought' : 'wallet.journalItemSold', {
        quantity: formatCount(transaction.quantity),
        unitPrice: formatIsk(transaction.unit_price, 2),
        total: formatIsk(Math.abs(transactionTotal(transaction)), 2),
      })
    : null;
  return (
    <div className="flex flex-col gap-1">
      <span>{describedWithPlayer(entry.description, player)}</span>
      {kills ? (
        <BountyFactionSummary kills={kills} />
      ) : (
        entry.reason &&
        (reasonIsTaxLink && soleTaxEntry ? (
          <Link
            to={soleTaxEntry.href}
            className={`${inlineLinkClassName} w-fit`}
            aria-label={t('wallet.journalMiningTaxReasonLink', { reason: entry.reason })}
          >
            {entry.reason}
          </Link>
        ) : (
          <span className="text-text-dim">{entry.reason}</span>
        ))
      )}
      {contractId !== undefined && (
        <Link
          to={`/contracts/history?${HIGHLIGHT_PARAM}=${contractId}`}
          className={inlineLinkClassName}
        >
          {t('wallet.journalContractLink')}
        </Link>
      )}
      {!reasonIsTaxLink &&
        miningTaxEntries?.map((taxEntry) => (
          <Link key={taxEntry.href} to={taxEntry.href} className={`${inlineLinkClassName} w-fit`}>
            {t('wallet.journalMiningTaxEntryLink', {
              date: taxEntry.date,
              amount: formatIsk(taxEntry.taxOwed, 0),
            })}
          </Link>
        ))}
      {canViewLoss && (
        <Button
          size="sm"
          className="w-fit"
          onClick={() => openLoss({ payoutDate: entry.date, characterId: lossCharacterId })}
        >
          {t('wallet.journalInsuranceLossLink')}
        </Button>
      )}
      {transaction && fill && (
        <Tooltip content={fill}>
          <ItemInfoLink
            typeId={transaction.type_id}
            className="inline-flex w-fit items-center gap-1.5"
          >
            <TypeIcon typeId={transaction.type_id} size={32} className="h-4 w-4 shrink-0" />
            <span>
              {itemName}
              <span className="text-text-dim"> ×{formatCount(transaction.quantity)}</span>
            </span>
          </ItemInfoLink>
        </Tooltip>
      )}
    </div>
  );
}
