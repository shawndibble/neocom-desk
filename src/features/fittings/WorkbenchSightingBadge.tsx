import { useTranslation } from 'react-i18next';
import { formatAge } from '@/lib/age';
import { useNow } from '@/lib/useNow';
import type { WorkbenchSighting } from './workbenchSightings';

/**
 * "Seen on zKillboard: 3 recent losses · last seen 2d ago" under an EVE
 * Workbench fit whose modules match a Popular fit (issue #2486). Renders
 * nothing for a fit with no match: not seen is not "not used" — PVE fits
 * rarely die — so the absence is never a warning.
 */
export function WorkbenchSightingBadge({ sighting }: { sighting: WorkbenchSighting | undefined }) {
  const { t } = useTranslation();
  const now = useNow();
  if (sighting === undefined) return null;
  return (
    <p className="text-xs text-accent">
      {t('fittings.popular.seenOnZkillboard', { count: sighting.count })}
      {sighting.lastSeen !== null &&
        ` · ${t('fittings.popular.lastSeen', {
          age: formatAge(Math.max(0, now - Date.parse(sighting.lastSeen)), t),
        })}`}
    </p>
  );
}
