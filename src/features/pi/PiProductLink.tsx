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
 * A product or item name on the PI tabs: opens its PI Product Detail
 * (DESIGN.md §6c "Entities", Overrides). Market and Show info sit in the ⋮ or the drawer.
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
