/**
 * Place Info: what a region, station or structure is and where it sits in New
 * Eden — its kind, its solar system (to Route Safety, with security) and its
 * region — plus Set destination / View route for a station or structure.
 * Station, system and region names come from the bundled tables, so a
 * station or region reads offline. A structure is read as the active
 * Character; one it cannot dock at has no name or system for it, and says so.
 * A solar system is not a target: systems open Route Safety (§6c).
 */
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { EmptyState, Modal, Spinner } from '@/components/ui';
import { loadSystemName } from '@/features/character/systemSecurity';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { SetDestinationButton } from '@/features/market/SetDestinationButton';
import {
  classifyPlaceInfoId,
  loadRegionName,
  loadSystemRegionId,
  placeKey,
  usePlaceDetails,
} from '@/features/places';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { PlaceLink, SystemLink } from './EntityLink';

/** One async read by id: `undefined` while pending, `null` for no id or no answer. */
function useLookup<T>(
  id: number | null | undefined,
  load: (id: number) => Promise<T | null>
): T | null | undefined {
  const loader = useCallback(() => load(id ?? 0).catch(() => null), [id, load]);
  const { status, data } = useKeyedLoad(id == null ? null : String(id), loader);
  if (id == null) return id;
  return status === 'ready' ? data : undefined;
}

export function PlaceInfoDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation();
  const classified = classifyPlaceInfoId(id);
  const kind = classified === 'solar_system' ? null : classified;
  const hydrated = useActiveCharacter((s) => s.hydrated);
  const scopeId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const isLocation = kind === 'station' || kind === 'structure';
  const refs = useMemo(() => (isLocation ? [{ locationId: id }] : []), [id, isLocation]);
  const details = usePlaceDetails(refs, {
    scopeId,
    enabled: hydrated && isLocation,
    origin: null,
    basis: null,
  });
  const detail = isLocation
    ? details.get(placeKey({ locationId: id, characterId: scopeId }))
    : undefined;

  // `undefined` = still reading, `null` = none.
  const systemId = isLocation ? detail?.systemId : null;
  const systemName = useLookup(systemId, loadSystemName);
  const regionOfSystem = useLookup(systemId, loadSystemRegionId);
  const regionId = kind === 'region' ? id : regionOfSystem;
  const regionName = useLookup(regionId, loadRegionName);
  const name = kind === 'region' ? regionName : detail?.name;

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
          {systemId != null && systemName && (
            <>
              <dt className="text-text-dim">{t('placeInfo.system')}</dt>
              <dd className="flex items-baseline gap-2">
                <SystemLink systemId={systemId}>{systemName}</SystemLink>
                {detail?.security != null && <SecurityStatus security={detail.security} />}
              </dd>
            </>
          )}
          {kind !== 'region' && regionId != null && regionName && (
            <>
              <dt className="text-text-dim">{t('placeInfo.region')}</dt>
              <dd>
                <PlaceLink id={regionId}>{regionName}</PlaceLink>
              </dd>
            </>
          )}
        </dl>
        {isLocation && <SetDestinationButton locationId={id} placeName={name} />}
      </div>
    );
  }

  return (
    <Modal open onClose={onClose} title={name ?? t('placeInfo.title')} closeOnBack={false}>
      {body}
    </Modal>
  );
}
