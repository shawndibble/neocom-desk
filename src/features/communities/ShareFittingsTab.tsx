import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, EmptyState, SearchInput, Spinner } from '@/components/ui';
import { fittingChoiceKey } from '@/engine/communities/sharedFittings';
import { ConfirmDialog } from './ConfirmDialog';
import { collectFittingsToShare } from './shareAllFittings';
import { loadFittingsAll, saveFittingsAll } from './shareSelection';
import {
  loadMySharedFittingKeys,
  shareFitting,
  shareFittings,
  unshareAllFittings,
  unshareFitting,
  type SharedFittingInput,
} from './sharedFittings';

/** A long list shows this many rows; the search narrows it. */
const ROW_LIMIT = 100;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function namedLike(inputs: readonly SharedFittingInput[], needle: string): SharedFittingInput[] {
  return inputs.filter((input) => input.name.toLowerCase().includes(needle)).sort(byName);
}

interface Loaded {
  fittings: SharedFittingInput[];
  /** The Fittings stopped since "share all" went on; null when it is off. */
  allExcluded: Set<string> | null;
  /** The Fittings this Character has in the Community now. */
  shared: Set<string>;
}

/**
 * The Fittings tab of a Community (issue #3605): what this Character shares,
 * one row per Fitting with Stop sharing. "Share all my Fittings" is a standing
 * switch: later saves are pushed too (`followSavedFitting`), and a Fitting
 * stopped under it is remembered so a re-save does not bring it back. With it
 * off, Fittings are added one at a time from the search. The Community's own
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
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const latest = useRef<Loaded | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const apply = useCallback((next: Loaded | null) => {
    latest.current = next;
    setLoaded(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const [fittings, allExcluded, shared] = await Promise.all([
        collectFittingsToShare(characterId),
        loadFittingsAll(characterId, communityId),
        loadMySharedFittingKeys(characterId, communityId),
      ]);
      apply({ fittings, allExcluded, shared });
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [characterId, communityId, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Runs one change after the one before, each from the state the one before
   * left. A failure reloads the truth from the Community and this device
   * instead of guessing how to undo.
   */
  function run(change: (current: Loaded) => Promise<Loaded>): Promise<void> {
    setNotice(null);
    queue.current = queue.current.then(async () => {
      const current = latest.current;
      if (current === null) return;
      try {
        apply(await change(current));
      } catch {
        setNotice(t('communities.fittings.failed'));
        await load();
      }
    });
    return queue.current;
  }

  const fittings = useMemo(() => loaded?.fittings ?? [], [loaded]);
  const needle = query.trim().toLowerCase();
  const sharedRows = useMemo(
    () =>
      namedLike(
        fittings.filter((input) => loaded?.shared.has(fittingChoiceKey(input))),
        needle
      ),
    [fittings, loaded, needle]
  );
  const addable = useMemo(
    () =>
      loaded && loaded.allExcluded === null && needle !== ''
        ? namedLike(
            fittings.filter((input) => !loaded.shared.has(fittingChoiceKey(input))),
            needle
          )
        : [],
    [fittings, loaded, needle]
  );

  if (loadFailed) {
    return (
      <p role="alert" className="text-xs text-danger">
        {t('communities.fittings.loadFailed')}
      </p>
    );
  }
  if (loaded === null) return <Spinner size="sm" label={t('communities.loading')} />;
  if (fittings.length === 0 && loaded.shared.size === 0) {
    return <EmptyState title={t('communities.fittings.noFittings')} />;
  }

  const all = loaded.allExcluded !== null;

  async function turnOn(current: Loaded): Promise<Loaded> {
    await saveFittingsAll(characterId, communityId, new Set());
    await shareFittings(characterId, communityId, current.fittings);
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
    if (!(await shareFitting(characterId, communityId, input))) {
      setNotice(t('communities.fittings.cannot'));
      return current;
    }
    return { ...current, shared: new Set(current.shared).add(fittingChoiceKey(input)) };
  }

  const row = (input: SharedFittingInput, action: ReactNode) => (
    <li key={fittingChoiceKey(input)} className="flex items-center gap-2 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate">{input.name}</span>
      {input.source === 'game' && (
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.6875rem] text-text-dim">
          {t('communities.fittings.inGame')}
        </span>
      )}
      {action}
    </li>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-dim">{t('communities.fittings.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-8 items-center gap-2 text-xs font-medium">
          <Checkbox
            checked={all}
            onChange={(event) => {
              if (event.target.checked) void run(turnOn);
              else setConfirmingOff(true);
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
      </div>
      <SearchInput
        className="w-full"
        value={query}
        placeholder={all ? t('communities.fittings.filter') : t('communities.fittings.search')}
        aria-label={t('communities.fittings.search')}
        onChange={(event) => setQuery(event.target.value)}
      />
      {addable.length > 0 && (
        <section aria-label={t('communities.fittings.addable')} className="space-y-1">
          <h3 className="text-xs font-semibold">{t('communities.fittings.addable')}</h3>
          <ul className="divide-y divide-line">
            {addable.slice(0, ROW_LIMIT).map((input) =>
              row(
                input,
                <Button size="sm" onClick={() => void run((current) => add(current, input))}>
                  {t('communities.fittings.share')}
                </Button>
              )
            )}
          </ul>
        </section>
      )}
      {sharedRows.length === 0 ? (
        <EmptyState
          title={
            needle === '' ? t('communities.fittings.noneShared') : t('communities.share.noMatch')
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {sharedRows.slice(0, ROW_LIMIT).map((input) =>
            row(
              input,
              <Button size="sm" onClick={() => void run((current) => stop(current, input))}>
                {t('communities.fittings.stop')}
              </Button>
            )
          )}
        </ul>
      )}
      {notice !== null && (
        <p role="alert" className="text-xs text-danger">
          {notice}
        </p>
      )}
      <ConfirmDialog
        open={confirmingOff}
        title={t('communities.fittings.offTitle')}
        body={t('communities.fittings.offBody')}
        actionLabel={t('communities.fittings.offAction')}
        onClose={() => setConfirmingOff(false)}
        onConfirm={() => run(turnOff)}
      />
    </div>
  );
}
