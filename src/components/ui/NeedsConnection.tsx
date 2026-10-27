import { cloneElement, type MouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnline } from '@/stores/network';
import { Tooltip } from './Tooltip';

interface NeedsConnectionProps {
  /** The one control that needs the network: a `Button` (a sign-in, a download), or the SSO button. */
  children: ReactElement<{
    className?: string;
    onClick?: (event: MouseEvent<HTMLElement>) => void;
    'aria-disabled'?: boolean | 'true' | 'false';
  }>;
  /**
   * The control's own tooltip, when it has one (an icon-sized button naming
   * itself). Offline the reason is added as a second line, so the control keeps
   * one bubble rather than gaining a nested second one.
   */
  tooltip?: string;
}

/**
 * Online it leaves its child alone; offline it marks the child `aria-disabled`,
 * swallows the press and shows "Needs a connection" in a tooltip. Wrap every
 * control that needs the network to do anything: one whose press navigates to
 * EVE's SSO (login, re-auth, grant, add character), where offline the
 * navigation strands an installed app on the browser's error page with no way
 * back but the system gesture, and one that fetches (Settings → Offline data's
 * "Download everything"). Pair it with a visible reason when the control is
 * the page's main action; the tooltip alone does not reach touch or a screen
 * reader that skips it.
 *
 * `aria-disabled` rather than `disabled`, per DESIGN.md §6c "States and
 * motion": the control keeps focus and hover, so the tooltip can say why.
 *
 * The tree is the same in both states (`Tooltip` renders only the trigger when
 * it has no content), so a connectivity change never remounts the control:
 * focus stays put and a ref callback does not fire again.
 *
 * @summary Disables a sign-in control while the browser is offline, with a "Needs a connection" tooltip.
 */
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
            // A raw `<button>` has no `aria-disabled` handling of its own (`Button` does).
            onClick: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
          })}
    </Tooltip>
  );
}
