import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { marketLinkParams } from '@/engine/market/urlState';

interface MarketItemLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  typeId: number;
  children: ReactNode;
  className?: string;
  hubId?: string;
}

export function MarketItemLink({
  typeId,
  children,
  className,
  hubId,
  ...rest
}: MarketItemLinkProps) {
  const location = useLocation();
  const params = marketLinkParams(typeId, location.search, hubId);
  return (
    <Link
      {...rest}
      to={`/market/browser?${new URLSearchParams(params).toString()}`}
      className={className ?? entityLinkClassName()}
    >
      {children}
    </Link>
  );
}
