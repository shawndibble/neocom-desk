/**
 * A jump count that opens the route it counts: Route Safety to that system,
 * from the Character's current system. `JumpsLink` is for a row that already
 * holds the destination's solar system; `PlaceJumpsLink` for one that holds
 * only a station or structure id, resolved on click (`useViewRoute`).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { Tooltip } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { routeToHref } from './routeSafetyLink';
import { useViewRoute } from './useViewRoute';

/** A row's own click (open detail, select) must not fire when the count is the target. */
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

export function JumpsLink({
  systemId,
  fromId,
  preference,
  children,
}: {
  systemId: number;
  /** Where the count starts, when that isn't the Character's current system. */
  fromId?: number | null;
  /** The page's own route picker, when the count was worked out under it. */
  preference?: RoutePreferenceKind | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip content={t('travel.waypoints.viewRoute')}>
      <Link
        to={routeToHref(systemId, fromId, preference)}
        className={entityLinkClassName()}
        onClick={stop}
      >
        {children}
      </Link>
    </Tooltip>
  );
}

export function PlaceJumpsLink({
  locationId,
  preference,
  children,
  className,
}: {
  locationId: number;
  preference?: RoutePreferenceKind | null;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const { resolving, failed, view } = useViewRoute(locationId, preference);
  return (
    <>
      <Tooltip content={t('travel.waypoints.viewRoute')}>
        <button
          type="button"
          className={entityLinkClassName(`text-left ${className ?? ''}`.trim())}
          disabled={resolving}
          onClick={(event) => {
            stop(event);
            view();
          }}
        >
          {children}
        </button>
      </Tooltip>
      {failed && (
        <span role="alert" className="text-danger ml-1 text-xs">
          {t('travel.waypoints.viewRouteUnavailable')}
        </span>
      )}
    </>
  );
}
