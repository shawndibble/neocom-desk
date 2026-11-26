import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { minerIdFor } from '@/engine/corpTaxBook/charges';
import { divisionsPrimaryFirst, primaryDivisionOf } from '@/engine/corpTaxBook/uncounted';
import { coverOpenDays, previewPayment } from '@/engine/corpTaxBook/paymentPreview';
import type { DisplayRow } from '../groupRows';
import { defaultPayer } from '../settlePayer';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { buildSettleUpReason } from '../groupRows';
import { linkPayment } from '../ledgerActions';
import { SettleUpDialog, type SettleUpRow } from '../SettleUpDialog';
import { SettleInfoRow } from '../SettleUpParts';
import { useCopiedField } from '../settleUpFields';
import { CorpBookSyncNote } from './CorpBookSyncNote';
import { corpPayAccount, corpPayAccounts } from './corpPayAccount';
import { suggestedCode, type MinerPayCode } from './minerPayCodes';
import type { CorpBookViewBook } from './corpBookView';

interface Props {
  onClose: () => void;
  onPaid: () => void;
  book: CorpBookViewBook;
  rows: readonly DisplayRow[];
  codes: readonly MinerPayCode[];
  focus?: { rowId: string; characterId: number };
}

export function CorpPayDialog({ onClose, onPaid, book, rows, codes, focus }: Props) {
  const { t } = useTranslation();
  const { copied, copy } = useCopiedField();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const division = primaryDivisionOf(book.loaded.divisions, book.loaded.primaryDivision);
  const otherAccounts = corpPayAccounts(
    divisionsPrimaryFirst(book.loaded.divisions, book.loaded.primaryDivision).slice(1),
    book.loaded.divisionNames,
    t
  );
  const settleRows: SettleUpRow[] = rows.flatMap((dr) =>
    dr.assignment
      ? [
          {
            assignment: dr.assignment,
            characterName: dr.row.characterName,
            payeeName: book.corpName,
            payeeEntityId: book.loaded.corporationId,
          },
        ]
      : []
  );
  const minerOf = (payerId: number | null) => {
    if (payerId === null)
      return book.summary.miners.length === 1 ? book.summary.miners[0] : undefined;
    const minerId = minerIdFor(payerId, book.loaded.miners);
    return book.summary.miners.find((m) => m.minerId === minerId);
  };
  const several = codes.length > 1;
  const payerId = focus?.characterId ?? defaultPayer(settleRows, activeCharacterId) ?? undefined;
  return (
    <SettleUpDialog
      open
      onClose={onClose}
      onPaid={onPaid}
      rows={settleRows}
      {...(payerId !== undefined ? { payerId } : {})}
      owedFor={(payer) => {
        const miner = minerOf(payer);
        return (miner?.account.owes?.amount ?? 0) + (miner?.estimate ?? 0);
      }}
      preview={(amount, _paidOn, payer) => {
        const miner = minerOf(payer);
        if (!miner) return undefined;
        return coverOpenDays(
          previewPayment(miner.account.input, {
            id: 'preview',
            minerId: miner.minerId,
            characterId: payer ?? 0,
            amount,
            at: new Date().toISOString(),
            source: 'donation',
          }),
          miner.estimateDays ?? []
        );
      }}
      reason={(payer, outcome) =>
        buildSettleUpReason(
          suggestedCode(codes, payer ?? undefined)?.code ?? t('miningTax.settleUpReasonPrefix'),
          [],
          (outcome ? [...outcome.lines, ...outcome.openLines] : []).map((l) => l.date).sort()
        )
      }
      reasonHint={t('miningTax.corpBook.pay.codeInReason')}
      methods={['donation']}
      record={(payment) =>
        linkPayment(
          {
            payeeId: book.payee.id,
            kind: 'recorded',
            refId: crypto.randomUUID(),
            amount: payment.amount,
            paidOn: payment.paidOn,
            source: 'manual',
          },
          payment.payerId ?? activeCharacterId ?? book.loaded.characterIds[0] ?? 0
        )
      }
      toAccount={
        <SettleInfoRow
          label={t('miningTax.corpBook.pay.accountLabel')}
          value={corpPayAccount(division, book.loaded.divisionNames, t)}
          {...(otherAccounts.length > 0
            ? {
                note: t('miningTax.corpBook.pay.orAccounts', {
                  accounts: otherAccounts.join(', '),
                }),
              }
            : {})}
        />
      }
      notice={(_payer, amount) => (
        <div className="space-y-1.5 text-xs text-text-dim">
          {several && (
            <ul className="space-y-1">
              {codes.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center gap-2">
                  <span>{t('miningTax.corpBook.pay.codeOf', { character: c.character })}</span>
                  <span className="font-mono text-text">{c.code}</span>
                  <Button size="sm" onClick={() => void copy(c.code, c.code)}>
                    {copied === c.code
                      ? t('miningTax.settleUpCopied')
                      : t('miningTax.corpBook.pay.copy')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <CorpBookSyncNote book={book} owedNow={amount} showStanding={false} inDialog />
        </div>
      )}
    />
  );
}
