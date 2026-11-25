import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { minerIdFor } from '@/engine/corpTaxBook/charges';
import { divisionsPrimaryFirst, primaryDivisionOf } from '@/engine/corpTaxBook/uncounted';
import { previewPayment } from '@/engine/corpTaxBook/paymentPreview';
import type { DisplayRow } from '../groupRows';
import { defaultPayer } from '../settlePayer';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { buildSettleUpReason } from '../groupRows';
import { linkPayment } from '../ledgerActions';
import { SettleUpDialog, type SettleUpRow } from '../SettleUpDialog';
import { useCopiedField } from '../settleUpFields';
import { CorpBookSyncNote } from './CorpBookSyncNote';
import { corpPayAccount, corpPayAccounts } from './corpPayAccount';
import { suggestedCode, type MinerPayCode } from './minerPayCodes';
import type { CorpBookViewBook } from './corpBookView';

interface Props {
  onClose: () => void;
  onPaid: () => void;
  book: CorpBookViewBook;
  /** The book's owed rows on the page (`DisplayRow.corp` of kind `row`): who can pay. */
  rows: readonly DisplayRow[];
  /** Each of the member's Miners' own Reason code (`minerPayCodes`). */
  codes: readonly MinerPayCode[];
  /** Opened from one row: paid by that row's Character. A book is paid by amount, never by day. */
  focus?: { rowId: string; characterId: number };
}

/**
 * Settle up for a Corp Tax Book's Payee: how to send the money, read off the paying Character's
 * Miner's Running account (the book's own, with the member's donations in flight added): what it
 * owes, which days an amount pays oldest first, the Miner's own code as the Reason, and the
 * Account to pick in EVE's transfer window (the corp's own name for the division when a
 * Director's visit stored it, #6161). Nothing is recorded on the member's side: the book credits
 * the donation from its own wallet, and until it does the donation counts as in flight.
 */
export function CorpPayDialog({ onClose, onPaid, book, rows, codes, focus }: Props) {
  const { t } = useTranslation();
  const { copied, copy } = useCopiedField();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const division = primaryDivisionOf(book.loaded.divisions, book.loaded.primaryDivision);
  // The other divisions it reads: a donation into one of them is credited all the same.
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
  // The payer's Miner: a donation pays the account of its sender's Miner.
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
        if (!miner) return 0;
        // An open day's estimate is owed now too: paid early, it waits as credit for the bill.
        const estimate = rows.reduce(
          (sum, dr) =>
            dr.corp?.kind === 'row' &&
            dr.corp.view.state === 'estimate' &&
            dr.corp.view.minerId === miner.minerId
              ? sum + (dr.corp.view.taxOwed ?? 0)
              : sum,
          0
        );
        return (miner.account.owes?.amount ?? 0) + estimate;
      }}
      preview={(amount, _paidOn, payer) => {
        const miner = minerOf(payer);
        if (!miner) return undefined;
        return previewPayment(miner.account.input, {
          id: 'preview',
          minerId: miner.minerId,
          characterId: payer ?? 0,
          amount,
          // A donation sent now: the book credits it when it reads its wallet.
          at: new Date().toISOString(),
          source: 'donation',
        });
      }}
      // The Miner's code says whose money it is; the days say what it pays (oldest first).
      reason={(payer, outcome) =>
        buildSettleUpReason(
          suggestedCode(codes, payer ?? undefined)?.code ?? t('miningTax.settleUpReasonPrefix'),
          [],
          (outcome?.lines ?? []).map((l) => l.date).sort()
        )
      }
      reasonHint={t('miningTax.corpBook.pay.codeInReason')}
      methods={['donation']}
      // "I sent it": counted as paid until the book reads its wallet and does not find it.
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
      notice={(_payer, amount) => (
        <div className="space-y-1.5 text-xs text-text-dim">
          <p>
            <Trans
              i18nKey="miningTax.corpBook.pay.account"
              values={{ account: corpPayAccount(division, book.loaded.divisionNames, t) }}
              components={{ strong: <strong className="font-semibold text-text" /> }}
            />
          </p>
          {otherAccounts.length > 0 && (
            <p>
              {t('miningTax.corpBook.pay.alsoAccepted', { accounts: otherAccounts.join(', ') })}
            </p>
          )}
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
