import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import type { ChannelOffReason } from './channelOff';

/**
 * Says why a greyed channel box is greyed (issue #5330). A natively disabled
 * input swallows pointer events, so the tooltip sits on a wrapper. With no
 * reason the children render untouched.
 */
export function ChannelOffTip({
  reason,
  children,
}: {
  reason: ChannelOffReason | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (reason === null) return <>{children}</>;
  return (
    <Tooltip content={t(`settings.notifications.channelOff.${reason}`)} openOnTap>
      <span className="inline-flex">{children}</span>
    </Tooltip>
  );
}
