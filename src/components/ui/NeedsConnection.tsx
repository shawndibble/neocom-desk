import { cloneElement, type MouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnline } from '@/stores/network';
import { Tooltip } from './Tooltip';

interface NeedsConnectionProps {
  /** The one control that starts the sign-in: a `Button`, or the SSO button. */
  children: ReactElement<{
    className?: string;
    onClick?: (event: MouseEvent<HTMLElement>) => void;
    'aria-disabled'?: boolean | 'true' | 'false';
  }>;
}

/**
 * Online it renders its child untouched. Offline it marks the child
 * `aria-disabled`, swallows the press and adds a "Needs a connection" tooltip.
 * Wrap every control whose press navigates to EVE's SSO (login, re-auth, grant,
 * add character): offline, that navigation strands an installed app on the
 * browser's error page, with no way back but the system gesture.
 *
 * `aria-disabled` rather than `disabled`, per DESIGN.md §6c "States and
 * motion": the control keeps focus and hover, so the tooltip can say why.
 *
 * @summary Disables a sign-in control while the browser is offline, with a "Needs a connection" tooltip.
 */
export function NeedsConnection({ children }: NeedsConnectionProps) {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return children;
  return (
    <Tooltip content={t('common.needsConnection')} openOnTap>
      {cloneElement(children, {
        'aria-disabled': true,
        // A raw `<button>` has no `aria-disabled` handling of its own (`Button` does).
        onClick: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
      })}
    </Tooltip>
  );
}
