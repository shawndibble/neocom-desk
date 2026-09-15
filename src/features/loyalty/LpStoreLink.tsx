/**
 * A compact link to one corp's LP Store page (`/wallet/loyalty/:corporationId`,
 * `routes/LoyaltyStore.tsx`) — icon-only so it fits beside an already-tight
 * ISK figure at any width, the way `IconButton` does for an action. This is
 * a real navigation, not an action, so it renders a `Link` styled to match
 * `iconButtonClassName` rather than a button — the same split that class's
 * own doc comment calls out. Shared by Appraisal's LP column and the
 * Blueprint Acquisition modal, the two places an offer's corp is a fact
 * worth jumping to, not just naming.
 */
import { Link } from 'react-router-dom';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { iconButtonClassName } from '@/components/ui/iconButtonClassName';

export interface LpStoreLinkProps {
  corporationId: number;
  /** Full breakdown for the tooltip and accessible name, e.g. "850,000 ISK + 400,000 LP (Sisters of EVE)". */
  label: string;
}

export function LpStoreLink({ corporationId, label }: LpStoreLinkProps) {
  return (
    <Tooltip content={label}>
      <Link
        to={`/wallet/loyalty/${corporationId}`}
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
