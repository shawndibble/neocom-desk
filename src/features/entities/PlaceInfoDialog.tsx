import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { EmptyState, LoadFailedState, Modal, Spinner } from '@/components/ui';
import { loadSystemName, loadSystemSecurity } from '@/features/character/systemSecurity';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { SetDestinationButton } from '@/features/market/SetDestinationButton';
import {
  classifyPlaceInfoId,
  loadRegionName,
  loadSystemRegionId,
  resolvePlace,
} from '@/features/places';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { PlaceLink, SystemLink } from './EntityLink';
import { Link } from 'react-router-dom';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { ownedPlaces } from '@/engine/market/appraisalOwned';
import { assetHref } from '@/features/assets/assetBrowseModel';
import { useCachedAssetLists } from '@/features/assets/useCachedAssetLists';

function useLookup<T>(
  id: number | null | undefined,
  load: (id: number) => Promise<T | null>
): { value: T | null | undefined; failed: boolean; retry: () => void } {
  const loader = useCallback(() => load(id ?? 0), [id, load]);
  const { status, data, retry } = useKeyedLoad(id == null ? null : String(id), loader);
  if (id == null) return { value: id, failed: false, retry };
  return { value: status === 'ready' ? data : undefined, failed: status === 'failed', retry };
}

export function PlaceInfoDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation();
  const classified = classifyPlaceInfoId(id);
  const kind = classified === 'solar_system' ? null : classified;
  const hydrated = useActiveCharacter((s) => s.hydrated);
  const scopeId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const isLocation = kind === 'station' || kind === 'structure';
  const readPlace = useCallback(
    () => resolvePlace({ locationId: id, characterId: scopeId }),
    [id, scopeId]
  );
  const place = useKeyedLoad(hydrated && isLocation ? `${id}:${scopeId}` : null, readPlace);
  const detail = place.status === 'ready' ? place.data : undefined;

  const systemId = isLocation ? detail?.systemId : null;
  const systemName = useLookup(systemId, loadSystemName).value;
  const security = useLookup(systemId, loadSystemSecurity).value;
  const regionOfSystem = useLookup(systemId, loadSystemRegionId).value;
  const regionId = kind === 'region' ? id : regionOfSystem;
  const regionLookup = useLookup(regionId, loadRegionName);
  const regionName = regionLookup.value;
  const name = kind === 'region' ? regionName : detail?.name;
  const readFailed = isLocation ? place.status === 'failed' : regionLookup.failed;
  const retry = isLocation ? place.retry : regionLookup.retry;
  const assetLists = useCachedAssetLists(isLocation && scopeId !== null);
  const ownedHere = useMemo(
    () => assetLists !== null && ownedPlaces(assetLists).some((owned) => owned.id === id),
    [assetLists, id]
  );

  let body;
  if (kind !== null && readFailed) {
    body = <LoadFailedState title={t('placeInfo.loadFailed')} onRetry={retry} />;
  } else if (kind === null || name === null) {
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
                {security != null && <SecurityStatus security={security} />}
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
        {ownedHere && (
          <p className="text-sm">
            <Link to={assetHref(id, [], '?chars=all')} className={inlineLinkClassName}>
              {t('placeInfo.yourAssets')}
            </Link>
          </p>
        )}
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
