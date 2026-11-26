import { Fragment, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { productNavigation, piProductHref } from './piPlanLink';

interface PiProductLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  typeId: number;
  children: ReactNode;
  className?: string;
}

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

export function PiProductList({ items }: { items: readonly { typeId: number; name: string }[] }) {
  return (
    <>
      {items.map((item, i) => (
        <Fragment key={item.typeId}>
          {i > 0 && ', '}
          <PiProductLink typeId={item.typeId}>{item.name}</PiProductLink>
        </Fragment>
      ))}
    </>
  );
}
