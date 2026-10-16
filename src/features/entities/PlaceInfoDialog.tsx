/**
 * Place Info: what a region, station or structure is and where it sits in New
 * Eden — its kind, its solar system (to Route Safety, with security) and its
 * region — plus Set destination / View route for a station or structure.
 * Station, system and region names come from the bundled tables, so a
 * station or region reads offline. A structure is read as the active
 * Character; one it cannot dock at has no name or system for it, and says so.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { EmptyState, Modal, Spinner } from '@/components/ui';
import { SetDestinationButton } from '@/features/market/SetDestinationButton';
import { classifyPlaceInfoId, placeKey, usePlaceDetails } from '@/features/places';
import { loadRegionName, loadSystemRegionId } from '@/features/places/regions';
import { productionPlaceSource } from '@/features/places/resolve';
import type { PlaceSource } from '@/features/places/types';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { SystemLink } from './EntityLink';

/** Every read Place Info makes; a test hands in its own. */
export interface PlaceInfoSource {
  place: PlaceSource;
  regionName(regionId: number): Promise<string | null>;
  systemRegionId(systemId: number): Promise<number | null>;
}

const productionSource: PlaceInfoSource = {
  place: productionPlaceSource,
  regionName: loadRegionName,
  systemRegionId: loadSystemRegionId,
};

/** One async read by id: `undefined` while pending, `null` for no id or no answer. */
function useLookup<T>(
  id: number | null | undefined,
  load: (id: number) => Promise<T | null>
): T | null | undefined {
  const [state, setState] = useState<{ id: number; value: T | null } | null>(null);
  useEffect(() => {
    if (id == null) return;
    let cancelled = false;
    void load(id)
      .catch(() => null)
      .then((value) => {
        if (!cancelled) setState({ id, value });
      });
    return () => {
      cancelled = true;
    };
  }, [id, load]);
  if (id == null) return id;
  return state?.id === id ? state.value : undefined;
}

export function PlaceInfoDialog({
  id,
  onClose,
  source = productionSource,
}: {
  id: number;
  onClose: () => void;
  source?: PlaceInfoSource;
}) {
  const { t } = useTranslation();
  const kind = classifyPlaceInfoId(id);
  const hydrated = useActiveCharacter((s) => s.hydrated);
  const scopeId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const isPlace = kind !== null && kind !== 'region';
  const refs = useMemo(() => (isPlace ? [{ locationId: id }] : []), [id, isPlace]);
  const details = usePlaceDetails(refs, {
    scopeId,
    enabled: hydrated && isPlace,
    origin: null,
    basis: null,
    source: source.place,
  });
  const detail = isPlace ? details.get(placeKey({ locationId: id, characterId: scopeId })) : null;

  const systemId = detail === null ? null : detail?.systemId;
  const systemName = useLookup(kind === 'solar_system' ? null : systemId, source.place.systemName);
  const regionOfSystem = useLookup(systemId, source.systemRegionId);
  const regionId = kind === 'region' ? id : regionOfSystem;
  const regionName = useLookup(regionId, source.regionName);
  const name = kind === 'region' ? regionName : detail?.name;
  const shownSystemName = kind === 'solar_system' ? name : systemName;

  let body;
  if (kind === null || name === null) {
    body =
      kind === 'structure' ? (
        <EmptyState
          title={t('placeInfo.structureUnreadable')}
          hint={t('placeInfo.structureUnreadableHint')}
        />
      ) : (
        <EmptyState title={t('placeInfo.unknown')} hint={t('placeInfo.unknownHint')} />
      );
  } else if (name === undefined) {
    body = <Spinner label={t('placeInfo.loading')} />;
  } else {
    body = (
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-dim">{t('placeInfo.type')}</dt>
          <dd>{t(`placeInfo.kind.${kind}`)}</dd>
          {systemId != null && shownSystemName && (
            <>
              <dt className="text-text-dim">{t('placeInfo.system')}</dt>
              <dd className="flex items-baseline gap-2">
                <SystemLink systemId={systemId}>{shownSystemName}</SystemLink>
                {detail?.security != null && <SecurityStatus security={detail.security} />}
              </dd>
            </>
          )}
          {kind !== 'region' && regionName && (
            <>
              <dt className="text-text-dim">{t('placeInfo.region')}</dt>
              <dd>{regionName}</dd>
            </>
          )}
        </dl>
        {(kind === 'station' || kind === 'structure') && (
          <SetDestinationButton locationId={id} placeName={name} />
        )}
      </div>
    );
  }

  return (
    <Modal open onClose={onClose} title={name ?? t('placeInfo.title')} closeOnBack={false}>
      {body}
    </Modal>
  );
}
