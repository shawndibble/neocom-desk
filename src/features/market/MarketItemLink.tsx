import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { marketLinkParams } from '@/engine/market/urlState';

interface MarketItemLinkProps {
  typeId: number;
  children: ReactNode;
}

/**
 * Wraps an item name with a link to its Market listing (#411), preserving
 * whatever region/hub the current page is already scoped to — same
 * `marketLinkParams` precedence as `ImplantChip` (#405) and the item context
 * menu's "View in Market".
 */
export function MarketItemLink({ typeId, children }: MarketItemLinkProps) {
  const location = useLocation();
  const params = marketLinkParams(typeId, location.search);
  return (
    <Link to={`/market?${new URLSearchParams(params).toString()}`} className="hover:underline">
      {children}
    </Link>
  );
}
