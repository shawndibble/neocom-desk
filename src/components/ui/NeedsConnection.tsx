import { cloneElement, type MouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnline } from '@/stores/network';
import { Tooltip } from './Tooltip';

interface NeedsConnectionProps {
  children: ReactElement<{
    className?: string;
    onClick?: (event: MouseEvent<HTMLElement>) => void;
    'aria-disabled'?: boolean | 'true' | 'false';
  }>;
  tooltip?: string;
}

/** @summary Disables a sign-in control while the browser is offline, with a "Needs a connection" tooltip. */
export function NeedsConnection({ children, tooltip }: NeedsConnectionProps) {
  const { t } = useTranslation();
  const online = useOnline();
  const reason = t('common.needsConnection');
  const content = online ? (tooltip ?? null) : tooltip ? `${tooltip}\n${reason}` : reason;
  return (
    <Tooltip content={content} openOnTap={!online}>
      {online
        ? children
        : cloneElement(children, {
            'aria-disabled': true,
            onClick: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
          })}
    </Tooltip>
  );
}
