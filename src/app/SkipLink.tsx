import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonClassName } from '@/components/ui/buttonClassName';

export const ROUTE_OUTLET_ID = 'route-outlet';

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
        variant: 'primary',
        size: 'sm',
        className:
          'sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:shadow-lg',
      })}
    >
      {t('nav.skipToContent')}
    </a>
  );
}
