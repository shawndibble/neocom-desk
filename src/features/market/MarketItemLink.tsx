import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { marketLinkParams } from '@/engine/market/urlState';

interface MarketItemLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  typeId: number;
  children: ReactNode;
  /** Replaces the default inline-link look, e.g. to draw it as a button. */
  className?: string;
}

/**
 * Wraps an item name with a link to its Market listing (#411), preserving
 * whatever region/hub the current page is already scoped to — same
 * `marketLinkParams` precedence as `ImplantChip` (#405) and the item context
 * menu's "View in Market".
 *
 * Extra anchor props (and `ref`) pass through to the `Link`, so a `Tooltip`
 * trigger (`asChild`) can wrap it and have its handlers land on the anchor.
 */
export function MarketItemLink({ typeId, children, className, ...rest }: MarketItemLinkProps) {
  const location = useLocation();
  const params = marketLinkParams(typeId, location.search);
  return (
    <Link
      {...rest}
      to={`/market/browser?${new URLSearchParams(params).toString()}`}
      className={
        className ??
        'hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
      }
    >
      {children}
    </Link>
  );
}
