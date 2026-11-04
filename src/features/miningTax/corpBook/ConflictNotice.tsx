import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { OreLine } from '@/engine/miningTax/types';
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';
import type { OverlapPreview } from './OverlapNotice';
import { typeLabel } from './typeLabel';

/** One of the miner's own Assignments that gives the contested ore to a Payee. */
export interface ConflictEntry {
  id: string;
  payeeName: string;
  taxOwed: number;
  paid: boolean;
}

interface Props {
  corpName: string;
  /** The entries behind the conflict; empty when none could be matched. */
  entries: readonly ConflictEntry[];
  /** Where the book recorded the ore: the refinery, else the system. */
  recordedAt: string;
  /** `YYYY-MM-DD` the conflict resolves to the corporation; empty when unknown. */
  resolvesOn: string;
  previews: readonly OverlapPreview[];
  typeNames: ReadonlyMap<number, string>;
  busy?: boolean;
  error?: string | null;
  /** Unmarks the paid entries, after which the ore can be released to the book. */
  onUnmarkPaid: () => void;
  /** Takes the contested ore off the unpaid entries, so the book alone bills it. */
  onTakeOver: () => void;
}

/**
 * A Conflict day's detail (the miner's own list gives ore to a Payee that a Corp
 * Tax Book also recorded): which entry clashes, what happens if nothing is done,
 * and the two ways out — the book is right (release the ore), or the entry is
 * right (an officer corrects the book). Facts first, then the fix, so the reason
 * never has to be pieced together from one long sentence.
 */
export function ConflictNotice({
  corpName,
  entries,
  recordedAt,
  resolvesOn,
  previews,
  typeNames,
  busy,
  error,
  onUnmarkPaid,
  onTakeOver,
}: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const anyPaid = entries.some((e) => e.paid);
  const payees = [...new Set(entries.map((e) => e.payeeName))].join(', ');
  const describe = (lines: readonly OreLine[]) =>
    lines.length === 0
      ? t('miningTax.corpBook.overlap.nothingLeft')
      : lines.map((l) => `${formatCount(l.quantity)} ${typeLabel(typeNames, l.typeId)}`).join(', ');

  return (
    <div
      role="region"
      aria-label={t('miningTax.corpBook.conflict.region')}
      className="space-y-2 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
    >
      <p className="font-semibold text-warning">{t('miningTax.corpBook.conflict.title')}</p>
      <ul className="list-disc space-y-0.5 pl-4">
        {entries.length === 0 ? (
          <li>{t('miningTax.corpBook.conflict.yourEntryUnknown')}</li>
        ) : (
          entries.map((entry) => (
            <li key={entry.id}>
              {t('miningTax.corpBook.conflict.yourEntry', {
                payee: entry.payeeName,
                amount: formatIsk(entry.taxOwed),
                status: entry.paid
                  ? t('miningTax.corpBook.conflict.entryPaid')
                  : t('miningTax.corpBook.conflict.entryOwed'),
              })}
            </li>
          ))
        )}
        <li>{t('miningTax.corpBook.conflict.bookEntry', { corp: corpName, place: recordedAt })}</li>
      </ul>
      {resolvesOn && (
        <p className="text-text-dim">
          {t('miningTax.corpBook.conflict.resolves', { corp: corpName, date: resolvesOn })}
        </p>
      )}

      <p className="font-semibold">{t('miningTax.corpBook.conflict.fixTitle')}</p>
      <ul className="list-disc space-y-1.5 pl-4">
        <li className="space-y-1">
          <p>
            {anyPaid
              ? t('miningTax.corpBook.conflict.bookRightPaid', { corp: corpName })
              : t('miningTax.corpBook.conflict.bookRight', { corp: corpName })}
          </p>
          {confirming && (
            <ul className="space-y-0.5 text-text-dim">
              {previews.map((p) => (
                <li key={p.payeeName}>
                  {t('miningTax.corpBook.overlap.previewLine', {
                    payee: p.payeeName,
                    before: describe(p.before),
                    after: describe(p.after),
                  })}
                </li>
              ))}
            </ul>
          )}
          {entries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {anyPaid ? (
                <Button size="sm" disabled={busy} onClick={onUnmarkPaid}>
                  {t('miningTax.unmarkPaidAction')}
                </Button>
              ) : confirming ? (
                <>
                  <Button size="sm" variant="primary" disabled={busy} onClick={onTakeOver}>
                    {t('miningTax.corpBook.overlap.confirm')}
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => setConfirming(false)}>
                    {t('common.cancel')}
                  </Button>
                </>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => setConfirming(true)}>
                  {t('miningTax.corpBook.overlap.letBill')}
                </Button>
              )}
            </div>
          )}
        </li>
        <li>
          {t('miningTax.corpBook.conflict.entryRight', {
            payee: payees || t('miningTax.corpBook.conflict.otherPayee'),
            corp: corpName,
          })}
        </li>
      </ul>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
