import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, EmptyState, SearchInput, Spinner } from '@/components/ui';
import {
  addShared,
  effectiveSelection,
  noneShared,
  shareAll,
  stopSharing,
  type ShareChoice,
} from '@/engine/communities/shareMode';
import { ConfirmDialog } from './ConfirmDialog';
import { publishSharedLibrary } from './libraryPush';
import { loadShareChoice, saveShareChoice } from './shareSelection';
import { useOwnedBlueprintTypes } from './useOwnedBlueprintTypes';

/** A long list shows this many rows; the search narrows it. */
const ROW_LIMIT = 100;

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
  onChanged,
  onOpenLibrary,
}: {
  characterId: number;
  communityId: string;
  /** The number of blueprints now shared, for the page's summary. */
  onChanged: (count: number) => void;
  onOpenLibrary: () => void;
}) {
  const { t } = useTranslation();
  const owned = useOwnedBlueprintTypes(characterId);
  const [choice, setChoice] = useState<ShareChoice | null>(null);
  const [query, setQuery] = useState('');
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadShareChoice(characterId, communityId).then((saved) => {
      if (!cancelled) setChoice(saved);
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
  const matches = (name: string) => needle === '' || name.toLowerCase().includes(needle);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const sharedRows = useMemo(
    () => types.filter((type) => sharedIds.has(type.typeId) && matches(type.name)).sort(byName),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `matches` closes over `needle`.
    [types, sharedIds, needle]
  );
  const addable = useMemo(
    () =>
      choice && !choice.all && needle !== ''
        ? types.filter((type) => !sharedIds.has(type.typeId) && matches(type.name)).sort(byName)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `matches` closes over `needle`.
    [types, sharedIds, choice, needle]
  );

  async function update(next: ShareChoice) {
    setFailed(false);
    const previous = choice;
    setChoice(next);
    try {
      await saveShareChoice(characterId, communityId, next);
      onChanged(effectiveSelection(typeIds, next).size);
      void publishSharedLibrary(characterId, communityId);
    } catch {
      setChoice(previous);
      setFailed(true);
    }
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

  const names = new Map(types.map((type) => [type.typeId, type.name]));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-8 items-center gap-2 text-xs font-medium">
          <Checkbox
            checked={choice.all}
            onChange={(event) => {
              if (event.target.checked) void update(shareAll());
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
                <Button size="sm" onClick={() => void update(addShared(choice, type.typeId))}>
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
              <span className="min-w-0 flex-1 truncate">{names.get(type.typeId)}</span>
              <Button size="sm" onClick={() => void update(stopSharing(choice, type.typeId))}>
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
        onConfirm={() => update(noneShared())}
      />
    </div>
  );
}
