import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonClassName } from '@/components/ui/buttonClassName';

/** The id `RouteOutlet`'s focusable div carries, so the skip link can land on it. */
export const ROUTE_OUTLET_ID = 'route-outlet';

/**
 * "Skip to content" (WCAG 2.4.1): the first focus stop in the shell, so a
 * keyboard pilot gets past the rail's ~33 stops. Hidden until focused. Not a
 * `#hash` link: `useRouteFocus` bails on a hash, and a hash would rewrite the
 * URL. Enter focuses the route outlet instead, so the next Tab is the page's
 * first control. The caller renders it at `md` and up only; below that the
 * rail is not there to skip.
 */
export function SkipLink() {
  const { t } = useTranslation();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById(ROUTE_OUTLET_ID)?.focus();
  };
  return (
    <a
      href={`#${ROUTE_OUTLET_ID}`}
      onClick={onClick}
      className={buttonClassName({
        size: 'sm',
        className:
          'sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:bg-panel focus-visible:shadow-lg',
      })}
    >
      {t('nav.skipToContent')}
    </a>
  );
}
