import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { markupPlainText, parseEveMarkup } from '@/engine/mail/eveMarkup';
import { MailBodyView } from '@/features/character/MailBodyView';

export interface MailPreviewContent {
  to: string;
  subject: string;
  body: string;
  /** The mail was cut down to day or refinery lines to fit 10,000 characters. */
  summarised?: boolean;
}

/** The mail as the miner will read it: recipient, subject and the EVE-markup body. */
export function StatementMailPreview({ to, subject, body, summarised }: MailPreviewContent) {
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

/** "Preview mail", opened from the Statements run's Check step (D16). */
export function StatementMailPreviewDialog({
  open,
  onClose,
  mail,
  nav,
}: {
  open: boolean;
  onClose: () => void;
  mail: MailPreviewContent | null;
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
      {mail && <StatementMailPreview {...mail} />}
    </Modal>
  );
}
