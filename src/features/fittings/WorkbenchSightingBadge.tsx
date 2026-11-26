import { useTranslation } from 'react-i18next';
import { formatAge } from '@/lib/age';
import { useNow } from '@/lib/useNow';
import type { WorkbenchSighting } from '@/engine/fittings/workbenchSightings';

export function WorkbenchSightingBadge({ sighting }: { sighting: WorkbenchSighting | undefined }) {
  const { t } = useTranslation();
  const now = useNow();
  if (sighting === undefined) return null;
  return (
    <p className="text-xs text-success">
      {sighting.lastSeen === null
        ? t('fittings.popular.seenOnZkillboard', { count: sighting.count })
        : t('fittings.popular.seenOnZkillboardLastSeen', {
            count: sighting.count,
            age: formatAge(Math.max(0, now - Date.parse(sighting.lastSeen)), t),
          })}
    </p>
  );
}
