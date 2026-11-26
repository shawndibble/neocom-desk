import { Link } from 'react-router-dom';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { iconButtonClassName } from '@/components/ui/iconButtonClassName';

export interface LpStoreLinkProps {
  corporationId: number;
  offerId?: number;
  label: string;
}

export function LpStoreLink({ corporationId, offerId, label }: LpStoreLinkProps) {
  return (
    <Tooltip content={label}>
      <Link
        to={`/wallet/lp-store/${corporationId}${offerId === undefined ? '' : `?offer=${offerId}`}`}
        aria-label={label}
        className={iconButtonClassName({ variant: 'plain', size: 'sm' })}
      >
        <span aria-hidden="true" className="flex items-center justify-center">
          <Icon.Buy size={Icon.ICON_SIZE.sm} />
        </span>
      </Link>
    </Tooltip>
  );
}
