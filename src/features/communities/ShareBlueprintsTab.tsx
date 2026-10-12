import { inlineLinkClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Checkbox, EmptyState, SearchInput, Spinner } from '@/components/ui';
import {
  addShared,
  effectiveSelection,
  noneShared,
  shareAll,
  stopSharing,
  type ShareChoice,
} from '@/engine/communities/shareMode';
import { bpcSourcingCommunityHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { ConfirmDialog } from './ConfirmDialog';
import { publishSharedLibrary, type PublishResult } from './libraryPush';
import { loadShareChoice, saveShareChoice } from './shareSelection';
import { useOwnedBlueprintTypes } from './useOwnedBlueprintTypes';

/** A long list shows this many rows; the search narrows it. */
const ROW_LIMIT = 100;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** The types whose name contains the search text (all of them when it is empty), by name. */
function namedLike<T extends { name: string }>(types: readonly T[], needle: string): T[] {
  return types.filter((type) => type.name.toLowerCase().includes(needle)).sort(byName);
}

/**
 * The Blueprints tab of a Community (issue #3599 follow-up): what this
 * Character shares, one row per blueprint with Stop sharing. "Share all my
 * blueprints" is a standing switch, so a blueprint acquired later is shared
 * too; under it a revoke is an exclusion. With it off, blueprints are added
 * one at a time from the search. Every change is saved on this device and
 * then published.
 */
export function ShareBlueprintsTab({
  characterId,
  communityId,
  onOpenLibrary,
}: {
  characterId: number;
  communityId: string;
  onOpenLibrary: () => void;
}) {
  const { t } = useTranslation();
  const owned = useOwnedBlueprintTypes(characterId);
  const [choice, setChoice] = useState<ShareChoice | null>(null);
  const [query, setQuery] = useState('');
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [failed, setFailed] = useState(false);
  const [published, setPublished] = useState<PublishResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadShareChoice(characterId, communityId).then((saved) => {
      if (!cancelled) setChoice(saved);
    });
    // Opening the tab checks what the Community holds against this device, so
    // blueprints left out show up here without waiting for a change.
    void publishSharedLibrary(characterId, communityId).then((result) => {
      if (!cancelled) setPublished(result);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId]);

  const types = useMemo(() => (owned.status === 'ready' ? owned.owned : []), [owned]);
  const typeIds = useMemo(() => types.map((type) => type.typeId), [types]);
  const sharedIds = useMemo(
    () => (choice ? effectiveSelection(typeIds, choice) : new Set<number>()),
    [choice, typeIds]
  );
  const needle = query.trim().toLowerCase();
  const sharedRows = useMemo(
    () =>
      namedLike(
        types.filter((type) => sharedIds.has(type.typeId)),
        needle
      ),
    [types, sharedIds, needle]
  );
  const addable = useMemo(
    () =>
      choice && !choice.all && needle !== ''
        ? namedLike(
            types.filter((type) => !sharedIds.has(type.typeId)),
            needle
          )
        : [],
    [types, sharedIds, choice, needle]
  );

  // Saves run one after another, each from the choice the one before left, so
  // two quick clicks never build from the same base and a failed save rolls
  // back exactly its own change.
  const latest = useRef<ShareChoice | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    latest.current = choice;
  }, [choice]);

  function update(change: (current: ShareChoice) => ShareChoice): Promise<void> {
    setFailed(false);
    queue.current = queue.current.then(async () => {
      const base = latest.current;
      if (!base) return;
      const next = change(base);
      latest.current = next;
      setChoice(next);
      try {
        await saveShareChoice(characterId, communityId, next);
        // Never rejects: 'unavailable' means nothing reached the Community this time.
        void publishSharedLibrary(characterId, communityId).then(setPublished);
      } catch {
        latest.current = base;
        setChoice(base);
        setFailed(true);
      }
    });
    return queue.current;
  }

  if (owned.status === 'loading' || choice === null) {
    return <Spinner size="sm" label={t('communities.share.loading')} />;
  }
  if (owned.status === 'needsReauth') {
    return <p className="text-xs text-text-dim">{t('communities.share.needsReauth')}</p>;
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
            checked={choice.all}
            onChange={(event) => {
              if (event.target.checked) update(shareAll);
              else setConfirmingOff(true);
            }}
          />
          {t('communities.blueprints.shareAll')}
        </label>
        <span role="status" className="text-xs text-text-dim">
          {choice.all
            ? t('communities.blueprints.allShared', { count: sharedIds.size })
            : t('communities.share.count', { count: sharedIds.size, total: types.length })}
        </span>
        <Button size="sm" className="ml-auto" onClick={onOpenLibrary}>
          {t('communities.blueprints.openLibrary')}
        </Button>
      </div>
      <p className="text-xs">
        <Link to={bpcSourcingCommunityHref()} className={inlineLinkClassName}>
          {t('communities.blueprints.browse')}
        </Link>
        <span className="text-text-dim"> · {t('communities.blueprints.browseHint')}</span>
      </p>
      <SearchInput
        className="w-full"
        value={query}
        placeholder={
          choice.all ? t('communities.blueprints.filter') : t('communities.blueprints.search')
        }
        aria-label={t('communities.share.search')}
        onChange={(event) => setQuery(event.target.value)}
      />
      {addable.length > 0 && (
        <section aria-label={t('communities.blueprints.addable')} className="space-y-1">
          <h3 className="text-xs font-semibold">{t('communities.blueprints.addable')}</h3>
          <ul className="divide-y divide-line">
            {addable.slice(0, ROW_LIMIT).map((type) => (
              <li key={type.typeId} className="flex items-center gap-2 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate">{type.name}</span>
                <Button
                  size="sm"
                  onClick={() => update((current) => addShared(current, type.typeId))}
                >
                  {t('communities.blueprints.share')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sharedRows.length === 0 ? (
        <EmptyState
          title={
            needle === '' ? t('communities.blueprints.noneShared') : t('communities.share.noMatch')
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {sharedRows.slice(0, ROW_LIMIT).map((type) => (
            <li key={type.typeId} className="flex items-center gap-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate">{type.name}</span>
              <Button
                size="sm"
                onClick={() => update((current) => stopSharing(current, type.typeId))}
              >
                {t('communities.blueprints.stop')}
              </Button>
            </li>
          ))}
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
      {published !== null && published.skipped > 0 && (
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
        onConfirm={() => update(noneShared)}
      />
    </div>
  );
}
