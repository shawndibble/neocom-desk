import { tappableRowClassName } from '@/components/ui/controlStyles';
import { InlineError } from '@/components/ui/InlineError';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { permissionsForEndpoints } from '@/esi/registry';
import {
  LiveNote,
  Button,
  Checkbox,
  EmptyState,
  SearchInput,
  Spinner,
  ToastStack,
  useDeferredCommits,
} from '@/components/ui';
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
import { publishSharedLibrary, type PublishResult } from './libraryPush';
import { BlueprintName, PlaceName } from './sharedBlueprintRows';
import { namedLike, needleOf, ROW_LIMIT } from './shareLists';
import { loadBlueprintShare, saveBlueprintShare } from './shareSelection';
import { useBlueprintCopies, usePlaceLabels } from './useBlueprintPlaces';
import { useOwnedBlueprintTypes } from './useOwnedBlueprintTypes';

function neighbours<K>(keys: readonly K[], index: number, refs: Map<K, HTMLButtonElement>) {
  const after = keys.slice(index + 1);
  const before = keys.slice(0, index).reverse();
  return [...after, ...before].map((key) => () => refs.get(key) ?? null);
}

const STOP_ALL_ID = 'stop-all';

const NO_STATUS: ReadonlyMap<number, TypeStatus> = new Map();

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
  const [savedShare, setShare] = useState<BlueprintShare | null>(null);
  const pendingOff = useDeferredCommits();
  const stoppingAll = pendingOff.hiddenIds.has(STOP_ALL_ID);
  const share = useMemo(
    () => (savedShare && stoppingAll ? noBlueprintsShared() : savedShare),
    [savedShare, stoppingAll]
  );
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState(false);
  const [published, setPublished] = useState<PublishResult | null>(null);

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
      if (saved.choice.all || saved.choice.allowed.size > 0 || saved.locations.size > 0)
        report(publishSharedLibrary(characterId, communityId));
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, report]);

  const types = useMemo(() => (owned.status === 'ready' ? owned.owned : []), [owned]);
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

  const latest = useRef<BlueprintShare | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const publishes = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  const locationButtons = useRef(new Map<number, HTMLButtonElement>());
  const stopButtons = useRef(new Map<number, HTMLButtonElement>());
  const focusAfterCommit = useFocusAfterCommit();
  useEffect(() => {
    latest.current = savedShare;
  }, [savedShare]);

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
        report(publishSharedLibrary(characterId, communityId));
      } catch {
        latest.current = base;
        setShare(base);
        setFailed(true);
      }
    });
    return queue.current;
  }

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
    return <InlineError>{t('communities.share.failed')}</InlineError>;
  }
  if (types.length === 0) return <EmptyState title={t('communities.share.noBlueprints')} />;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`flex items-center gap-2 text-xs font-medium ${tappableRowClassName}`}>
          <Checkbox
            checked={share.choice.all}
            onChange={(event) => {
              if (!event.target.checked) {
                pendingOff.defer({
                  id: STOP_ALL_ID,
                  message: t('communities.blueprints.stoppedAll'),
                  commit: () => update(noBlueprintsShared),
                });
              } else if (pendingOff.items.length > 0) pendingOff.undo(STOP_ALL_ID);
              else void update(shareAllBlueprints);
            }}
          />
          {t('communities.blueprints.shareAll')}
        </label>
        <LiveNote as="span" className="text-xs text-text-dim">
          {share.choice.all
            ? t('communities.blueprints.allShared', { count: sharedTypes.length })
            : t('communities.share.count', { count: sharedTypes.length, total: types.length })}
        </LiveNote>
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
                {entry?.direct && (
                  <Button
                    size="sm"
                    ref={(el) => {
                      if (el) stopButtons.current.set(type.typeId, el);
                      else stopButtons.current.delete(type.typeId);
                    }}
                    onClick={() => {
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
        <LiveNote className="text-xs text-warning">
          {t('communities.blueprints.unpublished')}
        </LiveNote>
      )}
      {published !== null && published.outcome !== 'unavailable' && published.skipped > 0 && (
        <LiveNote className="text-xs text-warning">
          {t('communities.blueprints.skipped', { count: published.skipped })}
        </LiveNote>
      )}
      {failed && <InlineError>{t('communities.share.saveFailed')}</InlineError>}
      <ToastStack
        items={pendingOff.items}
        undoLabel={t('communities.blueprints.undo')}
        onUndo={pendingOff.undo}
        onClose={pendingOff.commit}
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
        onShareType={(typeId) => {
          pendingOff.commit(STOP_ALL_ID);
          void update((current) => shareType(current, typeId));
        }}
        onShareLocation={(placeId) => {
          pendingOff.commit(STOP_ALL_ID);
          void update((current) => shareLocation(current, placeId));
        }}
        onStopLocation={(placeId) => {
          pendingOff.commit(STOP_ALL_ID);
          void update((current) => stopSharingLocation(current, placeId));
        }}
      />
    </div>
  );
}
