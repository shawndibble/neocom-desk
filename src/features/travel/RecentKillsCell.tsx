/**
 * One route system's zKillboard kills from the last hour (issue #2329): a
 * count linking to zKillboard, then where they happened. Gates on the path
 * are highlighted.
 *
 * Counts, places and times only (decision `20260912-172628`): "3 kills at
 * Stargate (Nourvukaiken), last one 32 min ago", "Smartbombs involved" —
 * never a word about what that means for the pilot.
 */
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { KillTags, RecentKillLocation } from '@/engine/route/recentKills';
import { systemZkillUrl } from '@/lib/zkillboard';
import type { RouteKillsCell } from './useRouteKills';

const BADGE = 'rounded-xs border px-1.5 text-[0.6875rem]';

function Tags({ tags }: { tags: KillTags }) {
  const { t } = useTranslation();
  const labels = [
    tags.bubble ? t('travel.kills.bubbles') : null,
    tags.smartbomb ? t('travel.kills.smartbombs') : null,
  ].filter((label): label is string => label !== null);
  if (labels.length === 0) return null;
  return (
    <>
      {labels.map((label) => (
        <span key={label} className={`${BADGE} border-warning/60 text-warning`}>
          {label}
        </span>
      ))}
    </>
  );
}

function LocationLine({ location }: { location: RecentKillLocation }) {
  const { t } = useTranslation();
  const text =
    location.name === null
      ? t('travel.kills.elsewhere', {
          count: location.count,
          minutes: location.minutesSinceLast,
        })
      : t('travel.kills.at', {
          count: location.count,
          location: location.name,
          minutes: location.minutesSinceLast,
        });
  return (
    <li className="flex flex-wrap items-center gap-1.5">
      <span className={location.onPath ? 'font-semibold text-accent' : 'text-text-dim'}>
        {text}
      </span>
      {location.onPath && (
        <span className={`${BADGE} border-accent/60 text-accent`}>{t('travel.kills.onPath')}</span>
      )}
      <Tags tags={location} />
    </li>
  );
}

export function RecentKillsCell({ systemId, cell }: { systemId: number; cell: RouteKillsCell }) {
  const { t } = useTranslation();
  if (cell.status === 'loading') return <Spinner size="sm" label={t('travel.kills.loading')} />;
  if (cell.status === 'unavailable') {
    return <span className="text-text-dim">{t('travel.kills.unavailable')}</span>;
  }
  const { summary } = cell;
  return (
    <div className="space-y-1 text-left">
      <a
        href={systemZkillUrl(systemId)}
        target="_blank"
        rel="noopener noreferrer"
        className={inlineLinkClassName}
      >
        {t('travel.kills.count', { count: summary.count })}
      </a>
      {summary.locations.length > 0 && (
        <ul className="space-y-0.5 text-[0.8125rem]">
          {summary.locations.map((location) => (
            <LocationLine key={location.key} location={location} />
          ))}
        </ul>
      )}
    </div>
  );
}
