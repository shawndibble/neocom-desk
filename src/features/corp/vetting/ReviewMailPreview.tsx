import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import type { RequestMailPreview } from './useVettingRequestMail';

export function ReviewMailPreview({
  mail,
  onClose,
}: {
  mail: RequestMailPreview;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open
      onClose={onClose}
      title={t('vetting.mailPreview.title', { name: mail.to })}
      placement="detail"
    >
      <div className="space-y-2 rounded-xs border border-line bg-bg p-3 font-mono text-xs leading-relaxed">
        <p>
          <span className="text-text-dim">{t('vetting.mailPreview.from')}:</span> {mail.from}
          <br />
          <span className="text-text-dim">{t('vetting.mailPreview.to')}:</span> {mail.to}
          <br />
          <span className="text-text-dim">{t('vetting.mailPreview.subject')}:</span> {mail.subject}
        </p>
        {mail.body.split('\n\n').map((paragraph) => (
          <p key={paragraph} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>
      <p className="mt-2 text-xs text-text-dim">
        {t('vetting.mailPreview.fixed', { officer: mail.from })}
      </p>
    </Modal>
  );
}
