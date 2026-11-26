import { Link } from 'react-router-dom';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { iconButtonClassName } from '@/components/ui/iconButtonClassName';
import { buildMarketGroupParams } from '@/engine/market/urlState';

export function MarketGroupLink({ groupId, label }: { groupId: number; label: string }) {
  return (
    <Tooltip content={label}>
      <Link
        to={`/market/browser?${new URLSearchParams(buildMarketGroupParams(groupId)).toString()}`}
        aria-label={label}
        className={iconButtonClassName({ size: 'sm', variant: 'plain' })}
      >
        <span aria-hidden="true" className="flex items-center justify-center">
          <Icon.Market size={Icon.ICON_SIZE.sm} />
        </span>
      </Link>
    </Tooltip>
  );
}
