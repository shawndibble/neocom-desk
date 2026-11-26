import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection, Spinner } from '@/components/ui';
import { cx } from '@/lib/cx';

interface MailSendButtonProps {
  size: 'sm' | 'md';
  sending: boolean;
  blocked: boolean;
  onSend: () => void;
}

function MailSendButton({ size, sending, blocked, onSend }: MailSendButtonProps) {
  const { t } = useTranslation();
  return (
    <NeedsConnection>
      <Button
        variant="primary"
        size={size}
        onClick={onSend}
        aria-disabled={sending || blocked || undefined}
      >
        {sending ? (
          <span className="flex items-center gap-1.5">
            <Spinner size="sm" /> {t('mail.sending')}
          </span>
        ) : (
          t('mail.send')
        )}
      </Button>
    </NeedsConnection>
  );
}

interface MailComposeFooterProps extends MailSendButtonProps {
  children?: ReactNode;
  pinned?: boolean;
}

export function MailComposeFooter({ children, pinned = false, ...send }: MailComposeFooterProps) {
  return (
    <footer
      className={cx(
        'flex shrink-0 items-center justify-between gap-2',
        pinned && 'border-t border-line bg-bg px-3 py-2'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">{children}</div>
      <MailSendButton {...send} />
    </footer>
  );
}
