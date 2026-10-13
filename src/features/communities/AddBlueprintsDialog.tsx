import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  Modal,
  SearchInput,
  Spinner,
  TabPanel,
  Tabs,
  useTabsId,
} from '@/components/ui';
import type { BlueprintTypeInfo } from '@/engine/communities/shareTree';
import { useIsPhone } from '@/lib/useIsPhone';
import { PlaceName, ViaLabel, type TypeStatus } from './sharedBlueprintRows';
import type { PlaceLabel } from './useBlueprintPlaces';

/** A long list shows this many rows; the search narrows it. */
const ROW_LIMIT = 100;

type Section = 'locations' | 'blueprints';

/**
 * Where a Member adds to what they share with a Community: a station or
 * structure (a standing rule, every blueprint there now and later) or one
 * blueprint type at a time. Each Share acts at once; the tab behind is the
 * list of what is shared. Under share-all only blueprints that were stopped
 * can be added, so there is no Locations section and no tab bar.
 */
export function AddBlueprintsDialog({
  open,
  onClose,
  shareAll,
  types,
  status,
  places,
  sharedLocations,
  labels,
  onShareType,
  onShareLocation,
  onStopLocation,
}: {
  open: boolean;
  onClose: () => void;
  shareAll: boolean;
  types: readonly BlueprintTypeInfo[];
  status: ReadonlyMap<number, TypeStatus>;
  /** Every place the Character holds blueprints at, with how many; null while they load. */
  places: ReadonlyMap<number, number> | null;
  sharedLocations: ReadonlySet<number>;
  labels: ReadonlyMap<number, PlaceLabel>;
  onShareType: (typeId: number) => void;
  onShareLocation: (placeId: number) => void;
  onStopLocation: (placeId: number) => void;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const tabsId = useTabsId();
  const [section, setSection] = useState<Section>('locations');
  const shown: Section = shareAll ? 'blueprints' : section;

  const body =
    shown === 'locations' ? (
      <LocationList
        places={places}
        sharedLocations={sharedLocations}
        labels={labels}
        onShare={onShareLocation}
        onStop={onStopLocation}
      />
    ) : (
      <BlueprintList types={types} status={status} labels={labels} onShare={onShareType} />
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('communities.blueprints.addTitle')}
      placement={isPhone ? 'sheet-full' : 'center'}
    >
      {shareAll ? (
        body
      ) : (
        <div className="space-y-2">
          <Tabs
            tabsId={tabsId}
            label={t('communities.blueprints.addSections')}
            value={section}
            onChange={(id) => setSection(id as Section)}
            tabs={[
              { id: 'locations', label: t('communities.blueprints.tabLocations') },
              { id: 'blueprints', label: t('communities.blueprints.tabBlueprints') },
            ]}
          />
          <TabPanel tabsId={tabsId} tabId={section}>
            {body}
          </TabPanel>
        </div>
      )}
    </Modal>
  );
}

function LocationList({
  places,
  sharedLocations,
  labels,
  onShare,
  onStop,
}: {
  places: ReadonlyMap<number, number> | null;
  sharedLocations: ReadonlySet<number>;
  labels: ReadonlyMap<number, PlaceLabel>;
  onShare: (placeId: number) => void;
  onStop: (placeId: number) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(
    () =>
      [...(places ?? [])].sort(([a], [b]) => {
        const nameA = labels.get(a)?.name;
        const nameB = labels.get(b)?.name;
        if (nameA && nameB) return nameA.localeCompare(nameB);
        return nameA ? -1 : nameB ? 1 : a - b;
      }),
    [places, labels]
  );
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-dim">{t('communities.blueprints.locationsHint')}</p>
      {places === null ? (
        <Spinner size="sm" label={t('communities.blueprints.placesLoading')} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('communities.blueprints.noLocations')} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(([placeId, count]) => {
            const shared = sharedLocations.has(placeId);
            return (
              <li key={placeId} className="flex items-center gap-2 py-1 text-xs">
                <PlaceName label={labels.get(placeId)} count={count} />
                <Button size="sm" onClick={() => (shared ? onStop(placeId) : onShare(placeId))}>
                  {shared ? t('communities.blueprints.stop') : t('communities.blueprints.share')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BlueprintList({
  types,
  status,
  labels,
  onShare,
}: {
  types: readonly BlueprintTypeInfo[];
  status: ReadonlyMap<number, TypeStatus>;
  labels: ReadonlyMap<number, PlaceLabel>;
  onShare: (typeId: number) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  // Every type the by-type choice leaves out, including one some of whose
  // copies a shared location already covers: its copies elsewhere need a way in.
  const addable = useMemo(
    () =>
      types
        .filter((type) => !status.get(type.typeId)?.direct)
        .filter((type) => type.name.toLowerCase().includes(needle))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [types, status, needle]
  );
  const anyAddable = types.some((type) => !status.get(type.typeId)?.direct);
  if (!anyAddable) return <EmptyState title={t('communities.blueprints.nothingToAdd')} />;
  return (
    <div className="space-y-2">
      <SearchInput
        className="w-full"
        value={query}
        placeholder={t('communities.blueprints.addSearch')}
        aria-label={t('communities.blueprints.addSearch')}
        onChange={(event) => setQuery(event.target.value)}
      />
      {addable.length === 0 ? (
        <EmptyState title={t('communities.share.noMatch')} />
      ) : (
        <ul className="divide-y divide-line">
          {addable.slice(0, ROW_LIMIT).map((type) => (
            <li key={type.typeId} className="flex items-center gap-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate">
                {type.name}
                <ViaLabel via={status.get(type.typeId)?.via ?? []} labels={labels} />
              </span>
              <Button size="sm" onClick={() => onShare(type.typeId)}>
                {t('communities.blueprints.share')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {addable.length > ROW_LIMIT && (
        <p className="text-xs text-text-dim">
          {t('communities.blueprints.limited', { count: ROW_LIMIT })}
        </p>
      )}
    </div>
  );
}
