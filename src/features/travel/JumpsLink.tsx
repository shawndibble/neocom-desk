/**
 * A jump count that opens the route it counts: Route Safety to that system,
 * from the Character's current system. `JumpsLink` is for a row that already
 * holds the destination's solar system; `PlaceJumpsLink` for one that holds
 * only a station or structure id, resolved on click (`useViewRoute`).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { routeToHref } from './routeSafetyLink';
import { useViewRoute } from './useViewRoute';

const linkClassName =
  'cursor-pointer underline decoration-dotted underline-offset-2 hover:text-accent';

/** A row's own click (open detail, select) must not fire when the count is the target. */
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

export function JumpsLink({
  systemId,
  fromId,
  children,
}: {
  systemId: number;
  /** Where the count starts, when that isn't the Character's current system. */
  fromId?: number | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={routeToHref(systemId, fromId)}
      className={linkClassName}
      title={t('travel.waypoints.viewRoute')}
      onClick={stop}
    >
      {children}
    </Link>
  );
}

export function PlaceJumpsLink({
  locationId,
  children,
  className,
}: {
  locationId: number;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const { resolving, failed, view } = useViewRoute(locationId);
  return (
    <button
      type="button"
      className={cx(linkClassName, 'text-left', className)}
      disabled={resolving}
      title={failed ? t('travel.waypoints.viewRouteUnavailable') : t('travel.waypoints.viewRoute')}
      onClick={(event) => {
        stop(event);
        view();
      }}
    >
      {children}
    </button>
  );
}
