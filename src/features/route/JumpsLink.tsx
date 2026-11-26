import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { Tooltip } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { routeToHref } from './routeSafetyLink';
import { useViewRoute } from './useViewRoute';

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

export function JumpsLink({
  systemId,
  stationId,
  fromId,
  preference,
  label,
  children,
}: {
  systemId: number;
  stationId?: number | null;
  label?: string;
  fromId?: number | null;
  preference?: RoutePreferenceKind | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip content={t('travel.waypoints.viewRoute')}>
      <Link
        to={routeToHref(systemId, fromId, preference, stationId)}
        className={entityLinkClassName()}
        aria-label={label}
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
          aria-disabled={resolving || undefined}
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
