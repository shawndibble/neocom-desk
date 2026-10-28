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
  const text = t(`settings.notifications.channelOff.${reason}`);
  return (
    <Tooltip content={text} openOnTap>
      {/* Focusable, with the reason as its text: a natively disabled box cannot take focus, so keyboard and screen-reader users would never reach the reason. */}
      <span tabIndex={0} className="inline-flex">
        {children}
        <span className="sr-only">{text}</span>
      </span>
    </Tooltip>
  );
}
