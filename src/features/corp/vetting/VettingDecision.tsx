import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Panel, TextArea } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { VETTING_NOTE_MAX, type VettingReview } from '@/engine/vetting';
import { callableErrorReason } from '@/lib/callableError';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import { useIsPhone } from '@/lib/useIsPhone';
import { askedByReviewer, signOffRows, vettingErrorKey, type SignOffRow } from './vettingView';

const ROW_TONE: Record<SignOffRow['kind'], PillTone> = {
  yours: 'warning',
  hidden: 'neutral',
  decided: 'neutral',
  barred: 'neutral',
};

/**
 * Who has to decide and where each stands. Another reviewer's decision stays hidden until the
 * caller records their own; whoever asked for the review cannot sign it off.
 */
function VettingSignOffs({ review, reviewerId }: { review: VettingReview; reviewerId: number }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const rows = signOffRows(review, reviewerId);
  const day = (at: number) => formatDateOnly(new Date(at), timeZone);
  if (rows.length === 0) {
    return <p className="text-sm text-text-dim">{t('vetting.decision.none')}</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row, index) => {
        const who =
          row.kind === 'yours' || (row.kind !== 'hidden' && row.you)
            ? t('vetting.decision.you')
            : row.name;
        const line =
          row.kind === 'yours'
            ? t('vetting.decision.notDecided')
            : row.kind === 'hidden'
              ? t('vetting.decision.hidden', { when: day(row.at) })
              : row.kind === 'barred'
                ? t('vetting.decision.asked')
                : t('vetting.decision.decidedOn', { when: day(row.at) });
        const word =
          row.kind === 'decided'
            ? t(`vetting.decision.outcome.${review.kind}.${row.decision}`)
            : t(`vetting.decision.word.${row.kind}`);
        return (
          <li key={index} className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{who}</span>
              <span className="block text-xs text-text-dim">{line}</span>
              {row.kind === 'decided' && row.note !== '' && (
                <span className="block text-xs break-words">{row.note}</span>
              )}
            </span>
            <Pill tone={ROW_TONE[row.kind]}>{word}</Pill>
          </li>
        );
      })}
    </ul>
  );
}

interface VettingDecisionProps {
  review: VettingReview;
  /** The signed-in reviewer, to tell "you asked for this" from being barred for another reason. */
  reviewerId: number;
  /** Records the caller's sign-off; rejects with the server's refusal. */
  onDecide: (decision: 'yes' | 'no', note: string) => Promise<void>;
}

/**
 * The decision rail: the sign-off list, a note kept with the caller's decision, and the two
 * buttons. Yes acts at once; No opens a confirm that needs the note, since the pilot's officers
 * read it as the reason.
 */
export function VettingDecision({ review, reviewerId, onDecide }: VettingDecisionProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refusing, setRefusing] = useState(false);
  const verb = (decision: 'yes' | 'no') => t(`vetting.decision.verb.${review.kind}.${decision}`);
  const canDecide = review.state === 'open' && review.yours;

  const decide = async (decision: 'yes' | 'no'): Promise<boolean> => {
    if (busy !== null) return false;
    setBusy(decision);
    setError(null);
    try {
      await onDecide(decision, note.trim());
      return true;
    } catch (err) {
      setError(t(vettingErrorKey(callableErrorReason(err))));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const noReady = note.trim().length > 0;
  const refuseButtons = (
    <>
      <Button variant="ghost" onClick={() => setRefusing(false)}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="danger"
        loading={busy === 'no'}
        aria-disabled={!noReady || undefined}
        onClick={
          noReady ? () => void decide('no').then((done) => done && setRefusing(false)) : undefined
        }
      >
        {verb('no')}
      </Button>
    </>
  );

  return (
    <Panel
      title={t('vetting.decision.title')}
      meta={t('vetting.decision.needed', {
        count: review.needed,
        signed: review.signed,
      })}
      metaOwnRow
    >
      <div className="space-y-3">
        <VettingSignOffs review={review} reviewerId={reviewerId} />
        {review.state === 'open' && review.needed > 1 && (
          <p className="text-xs text-text-dim">
            {t('vetting.decision.decidedWhen', { needed: review.needed })}
          </p>
        )}
        {canDecide && (
          <>
            <label className="block space-y-1">
              <span className="text-xs text-text-dim">{t('vetting.decision.note')}</span>
              <TextArea
                rows={2}
                maxLength={VETTING_NOTE_MAX}
                placeholder={t('vetting.decision.optional')}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2 [&>button]:w-full">
              <Button onClick={() => setRefusing(true)}>{verb('no')}</Button>
              <Button variant="success" loading={busy === 'yes'} onClick={() => void decide('yes')}>
                {verb('yes')}
              </Button>
            </div>
          </>
        )}
        {review.state === 'open' && review.barred && (
          <p className="text-xs text-text-dim">
            {t(
              askedByReviewer(review, reviewerId)
                ? 'vetting.decision.barredAsked'
                : 'vetting.decision.barredHint'
            )}
          </p>
        )}
        {error && !refusing && <InlineError>{error}</InlineError>}
      </div>
      {refusing && (
        <Modal
          open
          onClose={() => busy === null && setRefusing(false)}
          title={t(`vetting.decision.refuse.${review.kind}`, { pilot: review.pilot.name })}
          placement={phone ? 'sheet' : 'center'}
          dismissOnOutsidePress={false}
          footer={
            phone ? (
              <div className="flex flex-col-reverse gap-2 [&>button]:w-full">{refuseButtons}</div>
            ) : (
              <div className="flex justify-end gap-2">{refuseButtons}</div>
            )
          }
        >
          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-xs text-text-dim">{t('vetting.decision.reason')}</span>
              <TextArea
                rows={3}
                maxLength={VETTING_NOTE_MAX}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            {error && <InlineError>{error}</InlineError>}
            <p className="text-xs text-text-dim">{t('vetting.decision.refuseHint')}</p>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
