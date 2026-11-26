import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import type { ConflictCause } from '@/engine/corpTaxBook/personal';
import { formatIsk } from '@/lib/isk';
import { TakeoverConfirm, type OverlapPreview } from './TakeoverConfirm';

const TITLE_KEY: Record<ConflictCause, string> = {
  otherPayee: 'titleOtherPayee',
  ownNeedsReview: 'titleOwnNeedsReview',
  ownerCollected: 'titleOwnerCollected',
};

/** One of the miner's own entries that gives the contested ore to a Payee. */
export interface ConflictEntry {
  id: string;
  payeeName: string;
  taxOwed: number;
  paid: boolean;
}

interface Props {
  corpName: string;
  /** Why the records clash; absent on a row the engine gave no cause. */
  cause: ConflictCause | undefined;
  /** An `ownerCollected` conflict: the name of the miner's Payee that is the moon owner. */
  ownerName?: string;
  /** The entries behind the conflict; empty when none could be matched. */
  entries: readonly ConflictEntry[];
  /** Where the book recorded the ore: the refinery, else the system. */
  recordedAt: string;
  /** `YYYY-MM-DD` this app starts counting it as owed (the conflict resolves); empty when unknown. */
  resolvesOn: string;
  /** Other corporations whose books contest the same day, with what each would bill. */
  others: readonly { corpName: string; billAmount: number }[];
  previews: readonly OverlapPreview[];
  typeNames: ReadonlyMap<number, string>;
  busy?: boolean;
  error?: string | null;
  /** Takes the contested ore off the entries, so the book alone bills it. */
  onTakeOver: () => void;
  /** #6206: "Tell {corp}" this day's ore went to the entry's Payee, or what was sent. */
  tell?: ReactNode;
  /** Opens Resolve on this day: for an `ownerCollected` Conflict it is how the member says they paid the owner. */
  onResolve?: () => void;
}

/**
 * A Conflict day's detail: what clashes (the entry, and why: another Payee holds the ore,
 * the corporation's own Payee lists more than the book recorded or needs review, or a Collector
 * now collects for the moon owner the entry names), any other book
 * contesting the same day, and the two ways out — the book is right (take the ore off the entry),
 * or the entry is right (an officer corrects the book). Facts first, then the fix. What it
 * bills, and when, is the modal's header line.
 */
export function ConflictNotice({
  corpName,
  cause,
  ownerName = '',
  entries,
  recordedAt,
  resolvesOn,
  others,
  previews,
  typeNames,
  busy,
  error,
  onTakeOver,
  tell,
  onResolve,
}: Props) {
  const { t } = useTranslation();
  const k = (key: string) => `miningTax.corpBook.conflict.${key}`;

  return (
    <div
      role="region"
      aria-label={t(k('region'))}
      className="space-y-2 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
    >
      <p className="font-semibold text-warning">
        {t(k(TITLE_KEY[cause ?? 'otherPayee']), { corp: corpName, owner: ownerName })}
      </p>
      {cause === 'ownerCollected' && (
        <div className="space-y-1">
          <p>{t(k('ownerCollectedAsk'), { corp: corpName, owner: ownerName })}</p>
          {onResolve && (
            <Button size="sm" onClick={onResolve}>
              {t('miningTax.resolve.open')}
            </Button>
          )}
        </div>
      )}
      <ul className="list-disc space-y-0.5 pl-4">
        {entries.length === 0 ? (
          <li>{t(k('yourEntryUnknown'))}</li>
        ) : (
          entries.map((entry) => (
            <li key={entry.id}>
              {t(k('yourEntry'), {
                payee: entry.payeeName,
                amount: formatIsk(entry.taxOwed),
                status: t(k(entry.paid ? 'entryPaid' : 'entryOwed')),
              })}
            </li>
          ))
        )}
        <li>{t(k('bookEntry'), { corp: corpName, place: recordedAt })}</li>
      </ul>
      {resolvesOn && (
        <p className="text-text-dim">{t(k('countsFrom'), { corp: corpName, date: resolvesOn })}</p>
      )}
      {others.length > 0 && (
        <p className="text-text-dim">
          {t(k('alsoContested'), {
            list: others
              .map((o) =>
                t(k('alsoContestedItem'), { corp: o.corpName, amount: formatIsk(o.billAmount) })
              )
              .join(', '),
          })}
        </p>
      )}

      <p className="font-semibold">{t(k('fixTitle'))}</p>
      <ul className="list-disc space-y-1.5 pl-4">
        <li className="space-y-1">
          <p>{t(k(others.length > 0 ? 'booksRight' : 'bookRight'))}</p>
          {/* A paid day's ore can come off too: what its Payee was paid becomes credit there. */}
          {entries.length > 0 && (
            <TakeoverConfirm
              previews={previews}
              typeNames={typeNames}
              busy={busy}
              onTakeOver={onTakeOver}
              {...(others.length > 0 && { label: t(k('letEachBill')) })}
            />
          )}
        </li>
        <li className="space-y-1">
          <p>{t(k('entryRight'), { corp: corpName })}</p>
          {tell}
        </li>
      </ul>
      {error && <InlineError>{error}</InlineError>}
    </div>
  );
}
