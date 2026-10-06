import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { productNavigation, piProductHref } from './piPlanLink';

interface PiProductLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  typeId: number;
  children: ReactNode;
  /** Replaces the default `entityLinkClassName` look. */
  className?: string;
}

/**
 * A product or item name on the PI tabs (DESIGN.md §6c "Entities",
 * Overrides): opens its PI detail, the Map tab with that product's drawer
 * open (`?product=`), keeping the page's other params. A real link, so new
 * tab and copy link work; the history marker lets the drawer's Close go Back.
 * Market and Show info stay one step away, in the row's ⋮ or the drawer.
 */
export function PiProductLink({ typeId, children, className, ...rest }: PiProductLinkProps) {
  const location = useLocation();
  const { replace, state } = productNavigation(location);
  return (
    <Link
      {...rest}
      to={piProductHref(typeId, location.search)}
      replace={replace}
      state={state}
      className={className ?? entityLinkClassName()}
    >
      {children}
    </Link>
  );
}
