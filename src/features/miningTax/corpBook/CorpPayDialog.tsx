import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { DisplayRow } from '../groupRows';
import { recordCorpPayment } from '../ledgerActions';
import { SettleUpDialog, type SettleUpRow } from '../SettleUpDialog';
import { useCopiedField } from '../settleUpFields';
import { CorpBookSyncNote } from './CorpBookSyncNote';
import { corpPayAccount } from './corpPayAccount';
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
  /** Opened from one row: only it starts ticked, paid by its Character. */
  focus?: { rowId: string; characterId: number };
}

/**
 * Settle up for the corp Payee: the same dialog as any Payee's (Open in EVE, To / Amount /
 * Reason, the date and how it was paid), recording the payment on the member's side
 * (`recordCorpPayment`). What only a book adds sits under the copy box, kept to a line each: the
 * Account to pick in EVE's transfer window (the corp's own name for the division when a
 * Director's visit stored it, #6161; a member cannot read the names itself), a Statement's code (the Reason, when one
 * Statement is open), and whether it is safe to send yet (D12). The corp's book still credits
 * the donation from its own wallet.
 */
export function CorpPayDialog({
  onClose,
  onPaid,
  book,
  rows,
  systemNames,
  statementCodes,
  focus,
}: Props) {
  const { t } = useTranslation();
  const { copied, copy } = useCopiedField();
  const division = book.loaded.divisions[0] ?? 1;
  // A book row's synthetic Assignment and its DisplayRow share the row's id (`corpRows.syntheticRow`).
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
      payerId={focus?.characterId}
      focusIds={focus ? new Set([focus.rowId]) : undefined}
      systemNames={systemNames}
      reason={onlyCode?.code}
      recordPaid={(ticked, payment) =>
        recordCorpPayment(
          { corporationId: book.loaded.corporationId, name: book.corpName },
          ticked.flatMap((r) => views.get(r.assignment.id) ?? []),
          payment
        )
      }
      notice={
        <div className="space-y-1.5 text-xs text-text-dim">
          <p>
            <Trans
              i18nKey="miningTax.corpBook.pay.account"
              values={{ account: corpPayAccount(division, book.loaded.divisionNames, t) }}
              components={{ strong: <strong className="font-semibold text-text" /> }}
            />
          </p>
          {onlyCode ? (
            <p>{t('miningTax.corpBook.pay.codeInReason', { period: onlyCode.period })}</p>
          ) : statementCodes.length > 1 ? (
            <ul className="space-y-1">
              {statementCodes.map((s) => (
                <li key={s.code} className="flex flex-wrap items-center gap-2">
                  <span>{t('miningTax.corpBook.pay.code', { period: s.period })}</span>
                  <span className="font-mono text-text">{s.code}</span>
                  <Button size="sm" onClick={() => void copy(s.code, s.code)}>
                    {copied === s.code
                      ? t('miningTax.settleUpCopied')
                      : t('miningTax.corpBook.pay.copy')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <CorpBookSyncNote book={book} owedNow={owed} showCredit={false} />
        </div>
      }
    />
  );
}
