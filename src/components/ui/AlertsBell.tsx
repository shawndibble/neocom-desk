import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NavAlerts } from './icons';
import { Tooltip } from './Tooltip';
import { iconButtonClassName } from './iconButtonClassName';
import { UnreadAlertsContext } from './unreadAlertsContext';

/**
 * The Alerts page's way in, in every page header (scope decision
 * `20261009-163837-pinned-rail-alerts-bell-pilot-lookup-back-under`). It draws
 * nothing at all when no alert is waiting, so a phone header with other icons
 * in the corner stays clear; the page is still a route, reachable from Ctrl K.
 */
export function AlertsBell() {
  const { t } = useTranslation();
  const count = useContext(UnreadAlertsContext);
  if (count <= 0) return null;
  const label = t('nav.alertsWithCount', { count });
  return (
    <Tooltip content={label}>
      <Link
        to="/alerts"
        aria-label={label}
        className={iconButtonClassName({ className: 'relative' })}
      >
        <NavAlerts aria-hidden="true" />
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 min-w-4 rounded-xs bg-accent px-1 text-center text-[0.625rem] leading-4 font-semibold tabular-nums text-bg"
        >
          {count > 99 ? '99+' : count}
        </span>
      </Link>
    </Tooltip>
  );
}
