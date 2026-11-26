import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import type { ConflictCause } from '@/engine/corpTaxBook/personal';
import { formatIsk } from '@/lib/isk';
import { TakeoverConfirm, type OverlapPreview } from './TakeoverConfirm';

const TITLE_KEY: Record<ConflictCause, string> = {
  otherPayee: 'titleOtherPayee',
  overListed: 'titleOverListed',
  ownNeedsReview: 'titleOwnNeedsReview',
  ownerCollected: 'titleOwnerCollected',
};

export interface ConflictEntry {
  id: string;
  payeeName: string;
  taxOwed: number;
  paid: boolean;
}

interface Props {
  corpName: string;
  cause: ConflictCause | undefined;
  ownerName?: string;
  ownPayeeName?: string;
  entries: readonly ConflictEntry[];
  recordedAt: string;
  resolvesOn: string;
  others: readonly { corpName: string; billAmount: number }[];
  previews: readonly OverlapPreview[];
  typeNames: ReadonlyMap<number, string>;
  busy?: boolean;
  error?: string | null;
  onTakeOver: () => void;
  tell?: ReactNode;
  onResolve?: () => void;
}

export function ConflictNotice({
  corpName,
  cause,
  ownerName = '',
  ownPayeeName = '',
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
          <li>
            {cause === 'overListed'
              ? t(k('yourEntryOverListed'), { payee: ownPayeeName || corpName })
              : t(k('yourEntryUnknown'))}
          </li>
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
