import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import type { DisplayRow } from '../groupRows';
import { recordCorpPayment } from '../ledgerActions';
import { SettleUpDialog, type SettleUpRow } from '../SettleUpDialog';
import { CorpBookSyncNote } from './CorpBookSyncNote';
import type { CorpBookViewBook } from './corpBookView';

interface Props {
  onClose: () => void;
  onPaid: () => void;
  book: CorpBookViewBook;
  /** The book's owed rows on the page (`DisplayRow.corp` of kind `row`). */
  rows: readonly DisplayRow[];
  systemNames: ReadonlyMap<number, string>;
  /** Codes of the open Statements: a code in the donation reason pins it to one. */
  statementCodes: readonly { code: string; period: string }[];
}

/**
 * Settle up for the corp Payee: the same dialog as any Payee's (Open in EVE, To / Amount /
 * Reason, the date and how it was paid), recording the payment on the member's side
 * (`recordCorpPayment`). What only a book adds sits under the copy box: the division the
 * donation goes into, a Statement's code (the Reason, when one Statement is open), and whether
 * it is safe to send yet (D12). The corp's book still credits the donation from its own wallet.
 */
export function CorpPayDialog({ onClose, onPaid, book, rows, systemNames, statementCodes }: Props) {
  const { t } = useTranslation();
  const division = book.loaded.divisions[0] ?? 1;
  const views = new Map(
    rows.flatMap((dr) => (dr.corp?.kind === 'row' ? [[dr.key, dr.corp.view] as const] : []))
  );
  const settleRows: SettleUpRow[] = rows.flatMap((dr) =>
    dr.assignment && views.has(dr.key)
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
  const owed = settleRows.reduce((sum, r) => sum + r.assignment.taxOwed, 0);
  const onlyCode = statementCodes.length === 1 ? statementCodes[0] : undefined;
  return (
    <SettleUpDialog
      open
      onClose={onClose}
      onPaid={onPaid}
      rows={settleRows}
      systemNames={systemNames}
      reason={onlyCode?.code}
      record={(ticked, payment) =>
        recordCorpPayment(
          { corporationId: book.loaded.corporationId, name: book.corpName },
          ticked.flatMap((r) => views.get(r.assignment.id) ?? []),
          payment
        )
      }
      notice={
        <div className="space-y-1.5 text-xs text-text-dim">
          <p>{t('miningTax.corpBook.pay.how', { corp: book.corpName, division })}</p>
          {onlyCode ? (
            <p>{t('miningTax.corpBook.pay.codeInReason', { period: onlyCode.period })}</p>
          ) : statementCodes.length > 1 ? (
            <ul className="space-y-1">
              {statementCodes.map((s) => (
                <li key={s.code} className="flex flex-wrap items-center gap-2">
                  <span>{t('miningTax.corpBook.pay.code', { period: s.period })}</span>
                  <span className="font-mono text-text">{s.code}</span>
                  <Button size="sm" onClick={() => void writeToClipboard(s.code)}>
                    {t('miningTax.corpBook.pay.copy')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('miningTax.corpBook.pay.noCode')}</p>
          )}
          <CorpBookSyncNote book={book} owedNow={owed} />
        </div>
      }
    />
  );
}
