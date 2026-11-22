import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import { Button } from '@/components/ui';
import { SEND_MAIL_ENDPOINTS } from '@/esi/registry';
import type { MailRun } from '@/features/corpTaxBook/officerMail';
import { ActionResult } from '@/features/settings/settingsFields';
import { writeToClipboard } from '@/lib/clipboard';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { ReviewMailPreview } from './ReviewMailPreview';
import type { RequestMailPreview } from './useVettingRequestMail';
import { requestLink } from './vettingText';

interface TellMemberStepProps {
  /** The member's name. */
  name: string;
  /** The asking officer, whose Character sends the mail. */
  officerId: number;
  officerName: string;
  send: () => Promise<MailRun>;
  preview: () => Promise<RequestMailPreview | null>;
}

/**
 * After "Ask for a review": the member sees the request only when they open Neocom Desk, so the
 * officer may mail them the link. Never automatic; the press is the consent.
 */
export function TellMemberStep({
  name,
  officerId,
  officerName,
  send,
  preview,
}: TellMemberStepProps) {
  const { t } = useTranslation();
  const { copied, flash } = useCopyFeedback<'copied' | 'failed'>(2000);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<MailRun | null>(null);
  const [shown, setShown] = useState<RequestMailPreview | null>(null);
  const first = name.split(' ')[0] ?? name;
  const queued = run !== null && run.queued.length > 0;
  // Nobody queued, nobody failed: this device had already queued this mail.
  const already =
    run !== null && !run.missingScope && run.queued.length === 0 && run.failed.length === 0;
  const sent = queued || already;

  const press = async () => {
    if (busy) return;
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
    <div className="space-y-3">
      <p>{t('vetting.tell.intro', { name: first })}</p>
      {sent ? (
        <ActionResult kind="success">
          {already ? t('vetting.tell.already') : t('vetting.tell.queued', { name: first })}
        </ActionResult>
      ) : (
        <p className="text-xs text-text-dim">{t('vetting.tell.hint', { officer: officerName })}</p>
      )}
      {run !== null && run.failed.length > 0 && (
        <ActionResult kind="error">{t('vetting.tell.failed', { name: first })}</ActionResult>
      )}
      {run?.missingScope && (
        <GrantNote
          characterId={officerId}
          endpoints={SEND_MAIL_ENDPOINTS}
          title={t('vetting.tell.grantTitle')}
        />
      )}
      <div className="flex flex-wrap gap-2 [&>button]:w-full sm:[&>button]:w-auto">
        {!sent && (
          <Button variant="primary" loading={busy} onClick={() => void press()}>
            {t('vetting.tell.send', { name: first })}
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
      <p className="text-xs text-text-dim">{t('vetting.tell.queueHint')}</p>
      {shown && <ReviewMailPreview mail={shown} onClose={() => setShown(null)} />}
    </div>
  );
}
