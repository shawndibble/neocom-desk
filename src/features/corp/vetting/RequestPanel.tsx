import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, ValueList, ValueRow } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { GrantNote } from '@/app/GrantNote';
import type { VettingReview } from '@/engine/vetting';
import { SEND_MAIL_ENDPOINTS } from '@/esi/registry';
import { ActionResult } from '@/features/settings/settingsFields';
import { formatAge } from '@/lib/age';
import { writeToClipboard } from '@/lib/clipboard';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { useNow } from '@/lib/useNow';
import { ReviewMailPreview } from './ReviewMailPreview';
import type { RequestMailPreview } from './useVettingRequestMail';
import { requestMailCooldown, type RequestMailRun } from './vettingRequestMail';
import { requestLink } from './vettingText';
import { askedByReviewer } from './vettingView';

interface RequestPanelProps {
  review: VettingReview;
  /** The signed-in reviewer: tells "(you)" and whose Character sends the mail. */
  reviewerId: number;
  send: () => Promise<RequestMailRun>;
  preview: () => Promise<RequestMailPreview | null>;
}

/**
 * A review the member has not answered: who asked, for which role, whether the member was mailed
 * the link, and the mail actions. Stands where the report will be; "Nothing shared yet" follows.
 */
export function RequestPanel({ review, reviewerId, send, preview }: RequestPanelProps) {
  const { t } = useTranslation();
  const now = useNow();
  const { copied, flash } = useCopyFeedback<'copied' | 'failed'>(2000);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RequestMailRun | null>(null);
  const [shown, setShown] = useState<RequestMailPreview | null>(null);
  const first = review.pilot.name.split(' ')[0] ?? review.pilot.name;
  const asker = review.requestedBy;
  const isYou = askedByReviewer(review, reviewerId);
  const waiting = requestMailCooldown(review.requestMail, now) !== null;
  const age = (at: number) => formatAge(Math.max(0, now - at), t);

  const press = async () => {
    if (busy || waiting) return;
    setBusy(true);
    try {
      setRun(await send());
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await writeToClipboard(requestLink());
      flash('copied');
    } catch {
      // The clipboard was refused: nothing was copied, and the button says so.
      flash('failed');
    }
  };

  return (
    <Panel
      title={t('vetting.requestPanel.title')}
      actions={<Pill>{t('vetting.requestRow.waitingFor', { name: first })}</Pill>}
    >
      <div className="space-y-3 text-sm">
        <ValueList>
          {asker && (
            <ValueRow
              label={t('vetting.requestPanel.askedBy')}
              value={isYou ? t('vetting.requestPanel.you', { name: asker.name }) : asker.name}
            />
          )}
          <ValueRow label={t('vetting.requestPanel.asked')} value={age(review.createdAt)} />
          <ValueRow label={t('vetting.requestPanel.for')} value={review.role ?? ''} />
          <ValueRow
            label={t('vetting.requestPanel.mail')}
            value={
              review.requestMail
                ? t('vetting.requestRow.mailSent', { age: age(review.requestMail.sentAt) })
                : t('vetting.requestPanel.mailNone')
            }
            tone={review.requestMail ? 'default' : 'warning'}
          />
        </ValueList>
        {run?.unrecorded && (
          <ActionResult kind="error">
            {t('vetting.requestRow.mailUnrecorded', { name: first })}
          </ActionResult>
        )}
        {run?.cooldown && (
          <ActionResult kind="info">{t('vetting.requestRow.mailCooldown')}</ActionResult>
        )}
        {run !== null && !run.unrecorded && run.queued.length > 0 && (
          <ActionResult kind="success">
            {t('vetting.requestRow.mailQueued', { name: first })}
          </ActionResult>
        )}
        {run !== null && run.failed.length > 0 && (
          <ActionResult kind="error">
            {t('vetting.requestRow.mailFailed', { name: first })}
          </ActionResult>
        )}
        {run?.missingScope && (
          <GrantNote
            characterId={reviewerId}
            endpoints={SEND_MAIL_ENDPOINTS}
            title={t('vetting.requestRow.grantTitle')}
          />
        )}
        <div className="flex flex-wrap gap-2 [&>button]:w-full sm:[&>button]:w-auto">
          {isYou && (
            <Button
              variant={review.requestMail ? undefined : 'primary'}
              loading={busy}
              aria-disabled={waiting || undefined}
              onClick={waiting ? undefined : () => void press()}
            >
              {t(review.requestMail ? 'vetting.requestRow.resend' : 'vetting.requestRow.send', {
                name: first,
              })}
            </Button>
          )}
          <Button onClick={() => void preview().then(setShown)}>{t('vetting.tell.preview')}</Button>
          <Button onClick={() => void copy()}>
            {t(
              copied === 'failed'
                ? 'vetting.copyFailed'
                : copied
                  ? 'vetting.tell.linkCopied'
                  : 'vetting.tell.copyLink'
            )}
          </Button>
        </div>
        {isYou && waiting && review.requestMail && (
          <p className="text-xs text-text-dim">
            {t('vetting.requestRow.resendWait', { age: age(review.requestMail.sentAt) })}
          </p>
        )}
      </div>
      {shown && <ReviewMailPreview mail={shown} onClose={() => setShown(null)} />}
    </Panel>
  );
}
