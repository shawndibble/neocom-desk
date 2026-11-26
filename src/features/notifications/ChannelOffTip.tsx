import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import type { ChannelOffReason } from './channelOff';

export function ChannelOffTip({
  reason,
  children,
}: {
  reason: ChannelOffReason | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (reason === null) return <>{children}</>;
  const text = t(`settings.notifications.channelOff.${reason}`);
  return (
    <Tooltip content={text} openOnTap>
      <span tabIndex={0} className="inline-flex">
        {children}
        <span className="sr-only">{text}</span>
      </span>
    </Tooltip>
  );
}
