import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import type { RequestMailPreview } from './useVettingRequestMail';
import { DialogFooter } from '@/components/ui/DialogFooter';

export function ReviewMailPreview({
  mail,
  onClose,
}: {
  mail: RequestMailPreview;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  return (
    <Modal
      open
      onClose={onClose}
      title={t('vetting.mailPreview.title', { name: mail.to })}
      placement={phone ? 'sheet' : 'detail'}
      footer={
        <DialogFooter>
          <Button onClick={onClose}>{t('vetting.mailPreview.close')}</Button>
        </DialogFooter>
      }
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
