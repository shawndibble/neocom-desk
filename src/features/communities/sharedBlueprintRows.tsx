import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import type { PlaceLabel } from './useBlueprintPlaces';

/** A place's name, or a fallback while it loads and when it cannot be read. */
function usePlaceText() {
  const { t } = useTranslation();
  return (label: PlaceLabel | undefined) =>
    label === undefined
      ? t('communities.blueprints.locationLoading')
      : (label.name ?? t('communities.blueprints.unknownLocation'));
}

/**
 * One station or structure: its name, then its system and how many
 * blueprints sit there (left out when the count is not known).
 */
export function PlaceName({ label, count }: { label: PlaceLabel | undefined; count?: number }) {
  const { t } = useTranslation();
  const text = usePlaceText();
  const details = [
    label?.systemName,
    count === undefined ? undefined : t('communities.blueprints.copies', { count }),
  ].filter(Boolean);
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{text(label)}</span>
      {details.length > 0 && (
        <span className="block truncate text-text-dim">{details.join(' · ')}</span>
      )}
    </span>
  );
}

/**
 * A blueprint's name, and under it the shared locations it is shared through:
 * "via Jita IV - Moon 4", or the first one "+N more" with every name in a
 * tooltip, so the Member knows which location to stop.
 */
export function BlueprintName({
  name,
  via,
  labels,
}: {
  name: string;
  via: readonly number[];
  labels: ReadonlyMap<number, PlaceLabel>;
}) {
  const { t } = useTranslation();
  const text = usePlaceText();
  const first = via.length > 0 ? text(labels.get(via[0]!)) : '';
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{name}</span>
      {via.length === 1 && (
        <span className="block truncate text-text-dim">
          {t('communities.blueprints.via', { name: first })}
        </span>
      )}
      {via.length > 1 && (
        <span className="block truncate text-text-dim">
          <HintText content={via.map((placeId) => text(labels.get(placeId))).join('\n')}>
            {t('communities.blueprints.viaMore', { name: first, count: via.length - 1 })}
          </HintText>
        </span>
      )}
    </span>
  );
}
