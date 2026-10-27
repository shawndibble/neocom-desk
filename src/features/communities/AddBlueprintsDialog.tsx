import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Modal, SearchInput, SegmentedControl, Spinner } from '@/components/ui';
import type { TypeStatus } from '@/engine/communities/shareMode';
import type { BlueprintTypeInfo } from '@/engine/communities/shareTree';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useIsPhone } from '@/lib/useIsPhone';
import { BlueprintName, PlaceName } from './sharedBlueprintRows';
import { namedLike, needleOf, ROW_LIMIT } from './shareLists';
import type { PlaceLabel } from './useBlueprintPlaces';

type Section = 'locations' | 'blueprints';

/**
 * Where the Character's blueprints are, for the Locations section: loading,
 * unavailable (no cached assets, so a location rule could not publish
 * anything), or every place with how many blueprints sit there.
 */
export type DialogPlaces =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; counts: ReadonlyMap<number, number> };

/**
 * Where a Member adds to what they share with a Community: a station or
 * structure (a standing rule, every blueprint there now and later) or one
 * blueprint type at a time. Each Share acts at once; the tab behind is the
 * list of what is shared. Under share-all only blueprints that were stopped
 * can be added, so there is no Locations section and no switch.
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
  places: DialogPlaces;
  sharedLocations: ReadonlySet<number>;
  labels: ReadonlyMap<number, PlaceLabel>;
  onShareType: (typeId: number) => void;
  onShareLocation: (placeId: number) => void;
  onStopLocation: (placeId: number) => void;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [section, setSection] = useState<Section>('locations');
  const shown: Section = shareAll ? 'blueprints' : section;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('communities.blueprints.addTitle')}
      placement={isPhone ? 'sheet-full' : 'center'}
    >
      <div className="space-y-2">
        {!shareAll && (
          <SegmentedControl
            label={t('communities.blueprints.addSections')}
            value={section}
            onChange={setSection}
            options={[
              { value: 'locations', label: t('communities.blueprints.tabLocations') },
              { value: 'blueprints', label: t('communities.blueprints.tabBlueprints') },
            ]}
          />
        )}
        {shown === 'locations' ? (
          <LocationList
            places={places}
            sharedLocations={sharedLocations}
            labels={labels}
            onShare={onShareLocation}
            onStop={onStopLocation}
          />
        ) : (
          <BlueprintList types={types} status={status} labels={labels} onShare={onShareType} />
        )}
      </div>
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
  places: DialogPlaces;
  sharedLocations: ReadonlySet<number>;
  labels: ReadonlyMap<number, PlaceLabel>;
  onShare: (placeId: number) => void;
  onStop: (placeId: number) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(
    () =>
      [...(places.status === 'ready' ? places.counts : [])].sort(([a], [b]) => {
        const nameA = labels.get(a)?.name;
        const nameB = labels.get(b)?.name;
        if (nameA && nameB) return nameA.localeCompare(nameB);
        return nameA ? -1 : nameB ? 1 : a - b;
      }),
    [places, labels]
  );
  if (places.status === 'loading') {
    return <Spinner size="sm" label={t('communities.blueprints.placesLoading')} />;
  }
  if (places.status === 'unavailable') {
    return (
      <p className="text-xs text-text-dim">{t('communities.blueprints.locationsNeedAssets')}</p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-dim">{t('communities.blueprints.locationsHint')}</p>
      {rows.length === 0 ? (
        <EmptyState title={t('communities.blueprints.noLocations')} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(([placeId, count]) => {
            // The button stays and swaps its label, so focus stays on it.
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
  const search = useRef<HTMLInputElement>(null);
  const shareButtons = useRef(new Map<number, HTMLButtonElement>());
  const focusAfterCommit = useFocusAfterCommit();
  // Every type the by-type choice leaves out, including one some of whose
  // copies a shared location already covers: its copies elsewhere need a way in.
  const candidates = useMemo(
    () => types.filter((type) => !status.get(type.typeId)?.direct),
    [types, status]
  );
  const matches = useMemo(() => namedLike(candidates, needleOf(query)), [candidates, query]);
  const rows = matches.slice(0, ROW_LIMIT);
  if (candidates.length === 0) {
    return <EmptyState title={t('communities.blueprints.nothingToAdd')} />;
  }
  return (
    <div className="space-y-2">
      <SearchInput
        ref={search}
        className="w-full"
        value={query}
        placeholder={t('communities.blueprints.addSearch')}
        aria-label={t('communities.blueprints.addSearch')}
        onChange={(event) => setQuery(event.target.value)}
      />
      {rows.length === 0 ? (
        <EmptyState title={t('communities.share.noMatch')} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((type, index) => (
            <li key={type.typeId} className="flex items-center gap-2 py-1 text-xs">
              <BlueprintName
                name={type.name}
                via={status.get(type.typeId)?.via ?? []}
                labels={labels}
              />
              <Button
                size="sm"
                ref={(el) => {
                  if (el) shareButtons.current.set(type.typeId, el);
                  else shareButtons.current.delete(type.typeId);
                }}
                onClick={() => {
                  // Sharing removes this row: focus moves to a neighbour, else the search.
                  const near = [rows[index + 1], rows[index - 1]].map(
                    (other) => () => (other ? shareButtons.current.get(other.typeId) : null)
                  );
                  focusAfterCommit(...near, search);
                  onShare(type.typeId);
                }}
              >
                {t('communities.blueprints.share')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {matches.length > ROW_LIMIT && (
        <p className="text-xs text-text-dim">
          {t('communities.blueprints.limited', { count: ROW_LIMIT })}
        </p>
      )}
    </div>
  );
}
