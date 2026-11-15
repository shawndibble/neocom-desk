import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { callableErrorReason } from '@/lib/callableError';
import { disputeCorpTaxBookConflict } from './corpBookStore';

const k = (key: string) => `miningTax.corpBook.conflict.${key}`;

interface Props {
  view: Pick<
    BookRowView,
    | 'corporationId'
    | 'corpName'
    | 'characterId'
    | 'date'
    | 'oreLines'
    | 'recordKey'
    | 'flagged'
    | 'conflictCause'
  >;
  /** The Payee the member's own entry gives the ore to, by name. */
  payeeName: string;
  /** It landed: reload the books. */
  onSent: () => void;
}

/**
 * A Conflict day's "Tell {corp}" (#6206): the member sends the book the day, its ore and their
 * Payee, so an officer sees it in Needs you and dismisses the day or rejects it with a note.
 * Once sent it says so, and a rejection shows the officer's reason. Ore listed beyond what the
 * book recorded is never billed, so there is nothing to dispute.
 */
export function CorpDisputeAction({ view, payeeName, onSent }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'rejected' | 'other' | null>(null);
  if (view.flagged?.state === 'sent')
    return (
      <p className="text-text-dim">
        {t(k('told'), { corp: view.corpName, date: view.flagged.at.slice(0, 10) })}
      </p>
    );
  if (view.flagged?.state === 'rejected')
    return (
      <p className="text-warning">
        {t(k('toldRejected'), { corp: view.corpName, reason: view.flagged.reason ?? '' })}
      </p>
    );
  const recordKey = view.recordKey;
  if (recordKey === undefined || view.conflictCause === 'overListed') return null;
  const send = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await disputeCorpTaxBookConflict(view.characterId, {
        corporationId: view.corporationId,
        date: view.date,
        lines: view.oreLines.map((l) => ({
          recordKey,
          typeId: l.typeId,
          quantity: l.quantity,
          payeeName,
        })),
      });
      onSent();
    } catch (e) {
      setFailed(callableErrorReason(e) === 'rejected' ? 'rejected' : 'other');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <NeedsConnection>
        <Button size="sm" disabled={busy} onClick={() => void send()}>
          {t(k('tell'), { corp: view.corpName, payee: payeeName })}
        </Button>
      </NeedsConnection>
      {failed && (
        <InlineError>
          {t(k(failed === 'rejected' ? 'tellRejected' : 'tellFailed'), { corp: view.corpName })}
        </InlineError>
      )}
    </div>
  );
}
