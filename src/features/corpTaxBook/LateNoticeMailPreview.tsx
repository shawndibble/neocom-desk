import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { stackedLabelClassName } from '@/components/ui/controlStyles';
import {
  checkEditedMail,
  editedMailBlocked,
  editedMailLength,
} from '@/engine/corpTaxBook/lateNoticeMail';
import { EVE_MARKUP_LIMIT, markupPlainText, parseEveMarkup } from '@/engine/mail/eveMarkup';
import { MAX_SUBJECT_LENGTH } from '@/engine/mail/mailCompose';
import { cx } from '@/lib/cx';
import { MailBodyEditor } from '@/features/character/MailBodyEditor';
import { MailBodyView } from '@/features/character/MailBodyView';
import { MailCounter } from '@/features/character/MailCounter';

export interface MailPreviewContent {
  to: string;
  subject: string;
  body: string;
  /** The mail was cut down to day or refinery lines to fit 10,000 characters. */
  summarised?: boolean;
}

/** The mail as the miner will read it: recipient, subject and the EVE-markup body. */
export function LateNoticeMailPreview({ to, subject, body, summarised }: MailPreviewContent) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <span className="text-text-dim">{t('corpTaxBook.mailQueue.preview.to')}:</span> {to}
        <br />
        <span className="text-text-dim">{t('corpTaxBook.mailQueue.preview.subject')}:</span>{' '}
        {subject}
      </p>
      <MailBodyView text={markupPlainText(parseEveMarkup(body))} markup={body} />
      {summarised && (
        <p className="text-xs text-text-dim">{t('corpTaxBook.mailQueue.preview.summarised')}</p>
      )}
    </div>
  );
}

/** The officer's own subject and body for one Miner's mail, in place of the standard one. */
export interface MailEdit {
  subject: string;
  body: string;
  /** The standard mail's body the edit was made from: when that changes, the edit is stale. */
  basis: string;
}

/**
 * The mail with Edit: what the officer writes is what the queue sends to this one Miner. The
 * preview's verify link (`previewVerifyUrl`) is swapped for the real one when the mail is queued.
 * Nothing changes until Save; Use the standard mail drops the edit.
 */
export function EditableMailPreview({
  mail,
  edited,
  stale,
  basis,
  onSave,
  onReset,
  disabled,
}: {
  /** The mail as it will go: the edit when there is one, else the standard mail. */
  mail: MailPreviewContent;
  edited: boolean;
  /** The standard mail changed since the edit was saved (a payment, a new day). */
  stale?: boolean;
  /**
   * The standard mail a new draft starts from: the edit's own basis, else today's standard body.
   * Kept as the draft opened, so figures that change while the officer types are still flagged.
   */
  basis: string;
  onSave: (edit: MailEdit) => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<MailEdit | null>(null);
  const subjectId = useId();
  const bodyId = useId();
  const countId = useId();
  const origin = window.location.origin;
  if (draft === null) {
    return (
      <div className="space-y-3">
        {edited && <Pill tone="accent">{t('corpTaxBook.mailQueue.preview.edited')}</Pill>}
        {stale && (
          <p className="text-xs text-warning">{t('corpTaxBook.mailQueue.preview.stale')}</p>
        )}
        <LateNoticeMailPreview {...mail} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => setDraft({ subject: mail.subject, body: mail.body, basis })}
            aria-disabled={disabled || undefined}
          >
            {t('corpTaxBook.mailQueue.preview.edit')}
          </Button>
          {edited && (
            <Button size="sm" onClick={onReset} aria-disabled={disabled || undefined}>
              {t('corpTaxBook.mailQueue.preview.reset')}
            </Button>
          )}
        </div>
      </div>
    );
  }
  const problems = checkEditedMail(draft, origin);
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="text-text-dim">{t('corpTaxBook.mailQueue.preview.to')}:</span> {mail.to}
      </p>
      <div className="space-y-1">
        <label htmlFor={subjectId} className={stackedLabelClassName}>
          {t('corpTaxBook.mailQueue.preview.subject')}
        </label>
        <TextInput
          id={subjectId}
          size="sm"
          value={draft.subject}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          aria-invalid={problems.includes('subjectTooLong')}
          className="w-full"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={bodyId} className={stackedLabelClassName}>
          {t('mail.bodyLabel')}
        </label>
        <MailBodyEditor
          id={bodyId}
          value={draft.body}
          onChange={(body) => setDraft((current) => (current ? { ...current, body } : current))}
          aria-describedby={countId}
          aria-invalid={problems.includes('bodyTooLong')}
          counter={
            <MailCounter
              id={countId}
              count={editedMailLength(draft.body, origin)}
              max={EVE_MARKUP_LIMIT}
              warnFrom={0.9}
            />
          }
          className="min-h-48"
        />
      </div>
      {problems.map((p) => (
        <p key={p} className={cx('text-xs', p === 'noLink' ? 'text-warning' : 'text-text-dim')}>
          {t(`corpTaxBook.mailQueue.preview.problem.${p}`, { max: MAX_SUBJECT_LENGTH })}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave(draft);
            setDraft(null);
          }}
          aria-disabled={disabled || editedMailBlocked(problems) || undefined}
        >
          {t('corpTaxBook.mailQueue.preview.save')}
        </Button>
        <Button size="sm" onClick={() => setDraft(null)}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

/** "Preview mail", opened from the late notice run's Check step (D16). */
export function LateNoticeMailPreviewDialog({
  open,
  onClose,
  mail,
  nav,
  children,
}: {
  open: boolean;
  onClose: () => void;
  mail: MailPreviewContent | null;
  /** The dialog's body: the run's `EditableMailPreview` for `mail`. */
  children: ReactNode;
  /** With several Miners in the run: which one this is and how to step between them. */
  nav?: { position: number; count: number; onPrevious: () => void; onNext: () => void };
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open && mail !== null}
      onClose={onClose}
      title={t('corpTaxBook.mailQueue.preview.title')}
      placement="wide"
      footer={
        <>
          {nav && (
            <span className="mr-auto flex items-center gap-2">
              <Button variant="ghost" onClick={nav.onPrevious}>
                {t('corpTaxBook.mailQueue.preview.previous')}
              </Button>
              <span className="text-xs text-text-dim">
                {t('corpTaxBook.mailQueue.preview.position', {
                  position: nav.position,
                  count: nav.count,
                })}
              </span>
              <Button variant="ghost" onClick={nav.onNext}>
                {t('corpTaxBook.mailQueue.preview.next')}
              </Button>
            </span>
          )}
          <Button onClick={onClose}>{t('corpTaxBook.mailQueue.actions.close')}</Button>
        </>
      }
    >
      {mail && children}
    </Modal>
  );
}
