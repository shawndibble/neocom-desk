import { utcDayOf } from '../../../../functions/src/timeConstants';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection, plainTextActionClassName } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { callableErrorReason } from '@/lib/callableError';
import { mailNotOwed, type MailContext } from './resolve/resolveSubmit';
import { disputeCorpTaxBookConflict, withdrawCorpTaxBookDispute } from './corpBookStore';

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
    | 'billed'
  >;
  mail?: MailContext;
  onResolve?: () => void;
  payeeName: string;
  onSent: () => void;
}

export function CorpDisputeAction({ view, payeeName, onSent, onResolve, mail }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'rejected' | 'other' | null>(null);
  if (view.flagged?.state === 'sent') {
    const withdraw = async () => {
      setBusy(true);
      setFailed(null);
      try {
        await withdrawCorpTaxBookDispute(view.characterId, {
          corporationId: view.corporationId,
          date: view.date,
        });
        onSent();
      } catch (e) {
        if (callableErrorReason(e) === 'answered') onSent();
        setFailed(callableErrorReason(e) === 'answered' ? 'rejected' : 'other');
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3">
          <p className="text-text-dim">
            {t(k('told'), { corp: view.corpName, date: utcDayOf(view.flagged.at) })}
          </p>
          <NeedsConnection>
            <button
              type="button"
              className={plainTextActionClassName('min-h-9 md:min-h-6')}
              aria-disabled={busy || undefined}
              onClick={busy ? undefined : () => void withdraw()}
            >
              {t(k('withdraw'))}
            </button>
          </NeedsConnection>
        </div>
        {failed && (
          <InlineError>
            {failed === 'rejected'
              ? t(k('tellAnswered'), { corp: view.corpName })
              : t(k('withdrawFailed'))}
          </InlineError>
        )}
      </div>
    );
  }
  if (view.flagged?.state === 'dismissed')
    return (
      <p className="text-text-dim">
        {t(k('toldDismissed'), { corp: view.corpName, reason: view.flagged.reason ?? '' })}
      </p>
    );
  if (view.flagged?.state === 'rejected')
    return (
      <div className="space-y-1.5">
        <p className="text-warning">
          {t(k('toldRejected'), { corp: view.corpName, reason: view.flagged.reason ?? '' })}
        </p>
        {view.flagged.nextStep && (
          <p className="font-semibold text-text">
            {t('miningTax.resolve.facts.nextStep', { step: view.flagged.nextStep })}
          </p>
        )}
        {onResolve && (
          <Button size="sm" onClick={onResolve}>
            {t('miningTax.resolve.open')}
          </Button>
        )}
      </div>
    );
  const recordKey = view.recordKey;
  if (recordKey === undefined) return null;
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
      if (mail) await mailNotOwed(mail, view, '');
      onSent();
    } catch (e) {
      if (callableErrorReason(e) === 'rejected') onSent();
      setFailed(callableErrorReason(e) === 'rejected' ? 'rejected' : 'other');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <NeedsConnection>
        <Button
          size="sm"
          variant="warning"
          wrap
          aria-disabled={busy || undefined}
          onClick={() => void send()}
        >
          {t(k('tell'), { corp: view.corpName, payee: payeeName })}
        </Button>
      </NeedsConnection>
      {failed && (
        <InlineError>
          {t(k(failed === 'rejected' ? 'tellAnswered' : 'tellFailed'), { corp: view.corpName })}
        </InlineError>
      )}
    </div>
  );
}
