import { tappableRowClassName } from '@/components/ui/controlStyles';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  EmptyState,
  SearchInput,
  Spinner,
  ToastStack,
  useDeferredCommits,
} from '@/components/ui';
import { fittingChoiceKey } from '@/engine/communities/sharedFittings';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { AddSharedItemsDialog } from './AddSharedItemsDialog';
import { Pill } from '@/components/ui/Pill';
import { collectFittingsToShare } from './shareAllFittings';
import { namedLike, needleOf, ROW_LIMIT } from './shareLists';
import { loadFittingsAll, saveFittingsAll } from './shareSelection';
import { useSerialShareState } from './useSerialShareState';
import {
  loadMySharedFittingKeys,
  shareFitting,
  shareFittings,
  unshareAllFittings,
  unshareFitting,
  type SharedFittingInput,
} from './sharedFittings';

/** The source and key a `fittingChoiceKey` was made from. */
function keyOf(choiceKey: string): Pick<SharedFittingInput, 'source' | 'key'> {
  const source = choiceKey.startsWith('game-') ? 'game' : 'saved';
  return { source, key: choiceKey.slice(source.length + 1) };
}

interface Loaded {
  fittings: SharedFittingInput[];
  /** The Fittings stopped since "share all" went on; null when it is off. */
  allExcluded: Set<string> | null;
  /** The Fittings this Character has in the Community now. */
  shared: Set<string>;
}

/** The deferred-commit id of "stop sharing all"; only one is ever pending. */
const STOP_ALL_ID = 'stop-all';

/**
 * The Fittings tab's My sharing (issue #3605): what this Character shares, one
 * row per Fitting with Stop sharing, and Add Fittings for the rest. "Share all
 * my Fittings" is a standing switch: later saves are pushed too
 * (`followSavedFitting`), and a Fitting stopped under it is remembered so a
 * re-save does not bring it back, until it is added again. The Community's own
 * copy is the truth for what is shared; only the switch is kept on this device.
 */
export function ShareFittingsTab({
  characterId,
  communityId,
}: {
  characterId: number;
  communityId: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  // Stopping everything shows at once but writes after its Undo toast, so Undo is just not writing.
  const pendingOff = useDeferredCommits();
  const stoppingAll = pendingOff.hiddenIds.has(STOP_ALL_ID);
  const [adding, setAdding] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const stopButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterCommit = useFocusAfterCommit();

  const fetchAll = useCallback(async (): Promise<Loaded> => {
    const [fittings, allExcluded, shared] = await Promise.all([
      collectFittingsToShare(characterId),
      loadFittingsAll(characterId, communityId),
      loadMySharedFittingKeys(characterId, communityId),
    ]);
    return { fittings, allExcluded, shared };
  }, [characterId, communityId]);
  const {
    loaded: savedLoaded,
    loadFailed,
    notice,
    setNotice,
    run,
  } = useSerialShareState(fetchAll, 'communities.fittings.failed');

  const loaded = useMemo(
    () =>
      savedLoaded && stoppingAll
        ? { ...savedLoaded, allExcluded: null, shared: new Set<string>() }
        : savedLoaded,
    [savedLoaded, stoppingAll]
  );
  const fittings = useMemo(() => loaded?.fittings ?? [], [loaded]);
  const needle = needleOf(query);
  const unavailable = t('communities.fittings.unavailable');
  const sharedRows = useMemo(() => {
    if (!loaded) return [];
    const local = new Map(fittings.map((input) => [fittingChoiceKey(input), input]));
    // A Fitting the Community holds but this device no longer has (deleted in
    // game, scope lost) still gets a row, so it can still be stopped.
    const rows = [...loaded.shared].map(
      (key) => local.get(key) ?? { ...keyOf(key), name: unavailable, code: '' }
    );
    return namedLike(rows, needle);
  }, [fittings, loaded, needle, unavailable]);
  const shownRows = sharedRows.slice(0, ROW_LIMIT);
  // Everything not shared now, including a Fitting stopped under "share all".
  const addable = useMemo(
    () =>
      loaded
        ? namedLike(
            fittings.filter((input) => !loaded.shared.has(fittingChoiceKey(input))),
            ''
          )
        : [],
    [fittings, loaded]
  );

  if (loadFailed) {
    return (
      <p role="alert" className="text-xs text-danger">
        {t('communities.fittings.loadFailed')}
      </p>
    );
  }
  if (loaded === null) return <Spinner size="sm" label={t('communities.fittings.loading')} />;
  if (fittings.length === 0 && (savedLoaded?.shared.size ?? 0) === 0) {
    return <EmptyState title={t('communities.fittings.noFittings')} />;
  }

  const all = loaded.allExcluded !== null;

  async function turnOn(current: Loaded): Promise<Loaded> {
    await saveFittingsAll(characterId, communityId, new Set());
    try {
      await shareFittings(characterId, communityId, current.fittings);
    } catch (error) {
      // Some may have gone up: they stay listed and can be stopped, but the
      // switch goes back off so the rest can be added by hand.
      await saveFittingsAll(characterId, communityId, null);
      throw error;
    }
    return {
      ...current,
      allExcluded: new Set(),
      shared: await loadMySharedFittingKeys(characterId, communityId),
    };
  }

  async function turnOff(current: Loaded): Promise<Loaded> {
    await saveFittingsAll(characterId, communityId, null);
    await unshareAllFittings(characterId, communityId);
    return { ...current, allExcluded: null, shared: new Set() };
  }

  async function stop(current: Loaded, input: SharedFittingInput): Promise<Loaded> {
    const key = fittingChoiceKey(input);
    const allExcluded = current.allExcluded && new Set(current.allExcluded).add(key);
    if (allExcluded) await saveFittingsAll(characterId, communityId, allExcluded);
    await unshareFitting(characterId, communityId, input);
    const shared = new Set(current.shared);
    shared.delete(key);
    return { ...current, allExcluded, shared };
  }

  async function add(current: Loaded, input: SharedFittingInput): Promise<Loaded> {
    const key = fittingChoiceKey(input);
    // Under "share all" a stopped Fitting is an exclusion: adding it back lifts
    // it, so its later saves follow again. Lifted first, so a failure here
    // shares nothing (run() then reloads the truth); a share that does not go
    // through puts the exclusion back.
    const before = current.allExcluded;
    const lifted = before?.has(key) ?? false;
    let allExcluded = before;
    if (before && lifted) {
      allExcluded = new Set(before);
      allExcluded.delete(key);
      await saveFittingsAll(characterId, communityId, allExcluded);
    }
    let shared: boolean;
    try {
      shared = await shareFitting(characterId, communityId, input);
    } catch (error) {
      if (lifted) await saveFittingsAll(characterId, communityId, before);
      throw error;
    }
    if (!shared) {
      if (lifted) await saveFittingsAll(characterId, communityId, before);
      setNotice(t('communities.fittings.cannot'));
      return current;
    }
    return { ...current, allExcluded, shared: new Set(current.shared).add(key) };
  }

  const row = (input: SharedFittingInput, action: ReactNode) => (
    <li key={fittingChoiceKey(input)} className="flex items-center gap-2 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate">{input.name}</span>
      {input.source === 'game' && <Pill>{t('communities.fittings.inGame')}</Pill>}
      {action}
    </li>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-dim">{t('communities.fittings.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`flex items-center gap-2 text-xs font-medium ${tappableRowClassName}`}>
          <Checkbox
            checked={all}
            onChange={(event) => {
              if (!event.target.checked) {
                pendingOff.defer({
                  id: STOP_ALL_ID,
                  message: t('communities.fittings.stoppedAll'),
                  commit: () => run(turnOff),
                });
              } else if (pendingOff.items.length > 0) pendingOff.undo(STOP_ALL_ID);
              else void run(turnOn);
            }}
          />
          {t('communities.fittings.shareAll')}
        </label>
        <span role="status" className="text-xs text-text-dim">
          {all
            ? t('communities.fittings.allShared', { count: loaded.shared.size })
            : t('communities.fittings.count', {
                count: loaded.shared.size,
                total: fittings.length,
              })}
        </span>
        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          {t('communities.fittings.add')}
        </Button>
      </div>
      <SearchInput
        ref={search}
        className="w-full"
        value={query}
        placeholder={t('communities.fittings.filter')}
        aria-label={t('communities.fittings.filter')}
        onChange={(event) => setQuery(event.target.value)}
      />
      {sharedRows.length === 0 ? (
        <EmptyState
          title={
            needle === '' ? t('communities.fittings.noneShared') : t('communities.fittings.noMatch')
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {shownRows.map((input, index) =>
            row(
              input,
              <Button
                size="sm"
                ref={(el) => {
                  const key = fittingChoiceKey(input);
                  if (el) stopButtons.current.set(key, el);
                  else stopButtons.current.delete(key);
                }}
                onClick={() => {
                  // Stopping removes the row: focus the next Stop sharing, else the search.
                  const near = [shownRows[index + 1], shownRows[index - 1]].map(
                    (other) => () =>
                      other ? (stopButtons.current.get(fittingChoiceKey(other)) ?? null) : null
                  );
                  focusAfterCommit(...near, search);
                  void run((current) => stop(current, input));
                }}
              >
                {t('communities.fittings.stop')}
              </Button>
            )
          )}
        </ul>
      )}
      {/* While Add is open the notice shows in it: the page behind is inert. */}
      {notice !== null && !adding && (
        <p role="alert" className="text-xs text-danger">
          {notice}
        </p>
      )}
      <ToastStack
        items={pendingOff.items}
        undoLabel={t('communities.fittings.undo')}
        onUndo={pendingOff.undo}
        onClose={pendingOff.commit}
      />
      <AddSharedItemsDialog
        open={adding}
        onClose={() => setAdding(false)}
        title={t('communities.fittings.addTitle')}
        searchLabel={t('communities.fittings.addSearch')}
        shareLabel={t('communities.fittings.share')}
        nothingToAdd={t('communities.fittings.nothingToAdd')}
        notice={notice}
        items={addable.map((input) => ({
          key: fittingChoiceKey(input),
          name: input.name,
          note: input.source === 'game' && (
            <span className="text-[0.6875rem] text-text-dim">
              {t('communities.fittings.inGame')}
            </span>
          ),
        }))}
        onShare={(key) => {
          const input = addable.find((candidate) => fittingChoiceKey(candidate) === key);
          if (!input) return;
          pendingOff.commit(STOP_ALL_ID);
          void run((current) => add(current, input));
        }}
      />
    </div>
  );
}
