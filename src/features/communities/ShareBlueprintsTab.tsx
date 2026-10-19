import { tappableRowClassName } from '@/components/ui/controlStyles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { permissionsForEndpoints } from '@/esi/registry';
import { Button, Checkbox, EmptyState, SearchInput, Spinner } from '@/components/ui';
import {
  copiesByPlace,
  noBlueprintsShared,
  shareAllBlueprints,
  shareLocation,
  shareType,
  stopSharingLocation,
  stopSharingType,
  typeShareStatus,
  type BlueprintShare,
  type TypeStatus,
} from '@/engine/communities/shareMode';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { AddBlueprintsDialog, type DialogPlaces } from './AddBlueprintsDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { publishSharedLibrary, type PublishResult } from './libraryPush';
import { BlueprintName, PlaceName } from './sharedBlueprintRows';
import { namedLike, needleOf, ROW_LIMIT } from './shareLists';
import { loadBlueprintShare, saveBlueprintShare } from './shareSelection';
import { useBlueprintCopies, usePlaceLabels } from './useBlueprintPlaces';
import { useOwnedBlueprintTypes } from './useOwnedBlueprintTypes';

/** The next element, else the previous, among those still on the page: where focus goes when a row's control goes away. */
function neighbours<K>(keys: readonly K[], index: number, refs: Map<K, HTMLButtonElement>) {
  const after = keys.slice(index + 1);
  const before = keys.slice(0, index).reverse();
  return [...after, ...before].map((key) => () => refs.get(key) ?? null);
}

const NO_STATUS: ReadonlyMap<number, TypeStatus> = new Map();

/**
 * The Blueprints tab's My sharing (issue #3599 follow-up): what this
 * Character shares, one row per blueprint with Stop sharing. "Share all my
 * blueprints" is a standing switch, so a blueprint acquired later is shared
 * too; under it a revoke is an exclusion. Add blueprints opens a dialog to
 * share one blueprint type, or (switch off) every blueprint at a station or
 * structure as a standing rule; shared locations are listed here, and a
 * blueprint shared only through one says so instead of offering Stop sharing.
 * Every change is saved on this device and then published.
 */
export function ShareBlueprintsTab({
  characterId,
  communityId,
}: {
  characterId: number;
  communityId: string;
}) {
  const { t } = useTranslation();
  const owned = useOwnedBlueprintTypes(characterId);
  const copies = useBlueprintCopies(characterId);
  const [share, setShare] = useState<BlueprintShare | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [failed, setFailed] = useState(false);
  const [published, setPublished] = useState<PublishResult | null>(null);

  /** Shows a publish's result unless a later publish has been asked for since. */
  const report = useCallback((result: Promise<PublishResult>) => {
    const mine = ++publishes.current;
    void result.then((value) => {
      if (mine === publishes.current) setPublished(value);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadBlueprintShare(characterId, communityId).then((saved) => {
      if (cancelled) return;
      setShare(saved);
      // Opening the tab checks what the Community holds against this device, so
      // blueprints left out show up here without waiting for a change. Nothing
      // is chosen, nothing to check.
      if (saved.choice.all || saved.choice.allowed.size > 0 || saved.locations.size > 0)
        report(publishSharedLibrary(characterId, communityId));
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, report]);

  const types = useMemo(() => (owned.status === 'ready' ? owned.owned : []), [owned]);
  // Without cached assets nothing is placed (and nothing publishes): every type
  // still gets a status from the by-type choice.
  const placed = useMemo(
    () =>
      copies.status === 'ready'
        ? copies.copies
        : types.map((type) => ({ typeId: type.typeId, placeId: null })),
    [copies, types]
  );
  const status = useMemo(
    () => (share ? typeShareStatus(placed, share) : NO_STATUS),
    [share, placed]
  );
  const sharedTypes = useMemo(
    () =>
      types.filter((type) => {
        const entry = status.get(type.typeId);
        return entry !== undefined && (entry.direct || entry.via.length > 0);
      }),
    [types, status]
  );
  const needle = needleOf(query);
  const sharedRows = useMemo(() => namedLike(sharedTypes, needle), [sharedTypes, needle]);
  const places = useMemo(() => copiesByPlace(placed), [placed]);
  const dialogPlaces = useMemo<DialogPlaces>(
    () => (copies.status === 'ready' ? { status: 'ready', counts: places } : copies),
    [copies, places]
  );
  // Under share-all location rules are moot (and turning it on clears them).
  const sharedLocations = useMemo(
    () => (share && !share.choice.all ? [...share.locations].sort((a, b) => a - b) : []),
    [share]
  );
  const wanted = useMemo(
    () => (adding ? [...places.keys(), ...sharedLocations] : sharedLocations),
    [adding, places, sharedLocations]
  );
  const labels = usePlaceLabels(characterId, wanted);
  const shownRows = sharedRows.slice(0, ROW_LIMIT);
  const stoppable = shownRows
    .filter((type) => status.get(type.typeId)?.direct)
    .map((type) => type.typeId);

  // Saves run one after another, each from the choice the one before left, so
  // two quick clicks never build from the same base and a failed save rolls
  // back exactly its own change.
  const latest = useRef<BlueprintShare | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const publishes = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  const locationButtons = useRef(new Map<number, HTMLButtonElement>());
  const stopButtons = useRef(new Map<number, HTMLButtonElement>());
  const focusAfterCommit = useFocusAfterCommit();
  useEffect(() => {
    latest.current = share;
  }, [share]);

  function update(change: (current: BlueprintShare) => BlueprintShare): Promise<void> {
    setFailed(false);
    queue.current = queue.current.then(async () => {
      const base = latest.current;
      if (!base) return;
      const next = change(base);
      latest.current = next;
      setShare(next);
      try {
        await saveBlueprintShare(characterId, communityId, next);
        // Never rejects: 'unavailable' means nothing reached the Community this time.
        report(publishSharedLibrary(characterId, communityId));
      } catch {
        latest.current = base;
        setShare(base);
        setFailed(true);
      }
    });
    return queue.current;
  }

  // Until the places load, a blueprint shared only through a location would
  // read as not shared: wait rather than flash "No blueprints shared yet".
  if (owned.status === 'loading' || share === null || copies.status === 'loading') {
    return <Spinner size="sm" label={t('communities.share.loading')} />;
  }
  if (owned.status === 'needsReauth') {
    return (
      <p className="text-xs text-text-dim">
        <GrantMissingLink groups={permissionsForEndpoints(['getCharacterBlueprints'])} />
      </p>
    );
  }
  if (owned.status === 'failed') {
    return (
      <p role="alert" className="text-xs text-danger">
        {t('communities.share.failed')}
      </p>
    );
  }
  if (types.length === 0) return <EmptyState title={t('communities.share.noBlueprints')} />;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`flex items-center gap-2 text-xs font-medium ${tappableRowClassName}`}>
          <Checkbox
            checked={share.choice.all}
            onChange={(event) => {
              if (event.target.checked) update(shareAllBlueprints);
              else setConfirmingOff(true);
            }}
          />
          {t('communities.blueprints.shareAll')}
        </label>
        <span role="status" className="text-xs text-text-dim">
          {share.choice.all
            ? t('communities.blueprints.allShared', { count: sharedTypes.length })
            : t('communities.share.count', { count: sharedTypes.length, total: types.length })}
        </span>
        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          {t('communities.blueprints.add')}
        </Button>
      </div>
      {sharedLocations.length > 0 && (
        <section aria-label={t('communities.blueprints.sharedLocations')} className="space-y-1">
          <h3 className="text-xs font-semibold">{t('communities.blueprints.sharedLocations')}</h3>
          <ul className="divide-y divide-line">
            {sharedLocations.map((placeId, index) => (
              <li key={placeId} className="flex items-center gap-2 py-1 text-xs">
                <PlaceName
                  label={labels.get(placeId)}
                  count={copies.status === 'ready' ? (places.get(placeId) ?? 0) : undefined}
                />
                <Button
                  size="sm"
                  ref={(el) => {
                    if (el) locationButtons.current.set(placeId, el);
                    else locationButtons.current.delete(placeId);
                  }}
                  onClick={() => {
                    focusAfterCommit(
                      ...neighbours(sharedLocations, index, locationButtons.current),
                      search
                    );
                    void update((current) => stopSharingLocation(current, placeId));
                  }}
                >
                  {t('communities.blueprints.stop')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SearchInput
        ref={search}
        className="w-full"
        value={query}
        placeholder={t('communities.blueprints.filter')}
        aria-label={t('communities.share.search')}
        onChange={(event) => setQuery(event.target.value)}
      />
      {sharedRows.length === 0 ? (
        <EmptyState
          title={
            needle === '' ? t('communities.blueprints.noneShared') : t('communities.share.noMatch')
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {shownRows.map((type) => {
            const entry = status.get(type.typeId);
            return (
              <li key={type.typeId} className="flex items-center gap-2 py-1 text-xs">
                <BlueprintName name={type.name} via={entry?.via ?? []} labels={labels} />
                {/* Shared only through a location: stopping that location is the way out. */}
                {entry?.direct && (
                  <Button
                    size="sm"
                    ref={(el) => {
                      if (el) stopButtons.current.set(type.typeId, el);
                      else stopButtons.current.delete(type.typeId);
                    }}
                    onClick={() => {
                      // The button goes (and usually its row): focus the next Stop sharing.
                      const index = stoppable.indexOf(type.typeId);
                      focusAfterCommit(
                        ...neighbours(stoppable, index, stopButtons.current),
                        search
                      );
                      void update((current) => stopSharingType(current, type.typeId));
                    }}
                  >
                    {t('communities.blueprints.stop')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {sharedRows.length > ROW_LIMIT && (
        <p className="text-xs text-text-dim">
          {t('communities.blueprints.limited', { count: ROW_LIMIT })}
        </p>
      )}
      {published?.outcome === 'unavailable' && (
        <p role="status" className="text-xs text-warning">
          {t('communities.blueprints.unpublished')}
        </p>
      )}
      {published !== null && published.outcome !== 'unavailable' && published.skipped > 0 && (
        <p role="status" className="text-xs text-warning">
          {t('communities.blueprints.skipped', { count: published.skipped })}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t('communities.share.saveFailed')}
        </p>
      )}
      <ConfirmDialog
        open={confirmingOff}
        title={t('communities.blueprints.offTitle')}
        body={t('communities.blueprints.offBody')}
        actionLabel={t('communities.blueprints.offAction')}
        onClose={() => setConfirmingOff(false)}
        onConfirm={() => update(noBlueprintsShared)}
      />
      <AddBlueprintsDialog
        open={adding}
        onClose={() => setAdding(false)}
        shareAll={share.choice.all}
        types={types}
        status={status}
        places={dialogPlaces}
        sharedLocations={share.locations}
        labels={labels}
        onShareType={(typeId) => update((current) => shareType(current, typeId))}
        onShareLocation={(placeId) => update((current) => shareLocation(current, placeId))}
        onStopLocation={(placeId) => update((current) => stopSharingLocation(current, placeId))}
      />
    </div>
  );
}
