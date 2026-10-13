import { useTranslation } from 'react-i18next';
import type { PlaceLabel } from './useBlueprintPlaces';

/** A blueprint type's share: picked by type (`direct`), and the shared locations holding a copy. */
export interface TypeStatus {
  direct: boolean;
  via: number[];
}

/** A place's name, or a fallback while it loads and when it cannot be read. */
function usePlaceText() {
  const { t } = useTranslation();
  return (label: PlaceLabel | undefined) =>
    label === undefined
      ? t('communities.blueprints.locationLoading')
      : (label.name ?? t('communities.blueprints.unknownLocation'));
}

/** One station or structure: its name, then its system and how many blueprints sit there. */
export function PlaceName({ label, count }: { label: PlaceLabel | undefined; count: number }) {
  const { t } = useTranslation();
  const text = usePlaceText();
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{text(label)}</span>
      <span className="block truncate text-text-dim">
        {label?.systemName ? `${label.systemName} · ` : ''}
        {t('communities.blueprints.copies', { count })}
      </span>
    </span>
  );
}

/** "via Jita IV - Moon 4": the shared locations a blueprint is shared through. Nothing when none. */
export function ViaLabel({
  via,
  labels,
}: {
  via: readonly number[];
  labels: ReadonlyMap<number, PlaceLabel>;
}) {
  const { t } = useTranslation();
  const text = usePlaceText();
  if (via.length === 0) return null;
  return (
    <span className="text-text-dim">
      {' · '}
      {via.length === 1
        ? t('communities.blueprints.via', { name: text(labels.get(via[0]!)) })
        : t('communities.blueprints.viaMany', { count: via.length })}
    </span>
  );
}
