import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, SearchInput, Spinner } from '@/components/ui';
import { db, type SkillPlanRecord } from '@/db';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { AddSharedItemsDialog } from './AddSharedItemsDialog';
import { loadMySharedPlans, sharePlan, syncSharedPlans, unsharePlan } from './sharedPlans';

/** A long list shows this many rows; the search narrows it. */
const ROW_LIMIT = 100;

interface Loaded {
  plans: SkillPlanRecord[];
  /** Plan ids this Character has in the Community. */
  shared: Set<string>;
}

function namedLike(plans: readonly SkillPlanRecord[], needle: string): SkillPlanRecord[] {
  return plans
    .filter((plan) => plan.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The Skill plans tab's Mine view: what this Character shares, one row per
 * plan with Stop sharing, and Add Skill plans for the rest. Unlike Blueprints and
 * Fittings there is no "share all": each plan is shared by hand, so the page
 * never offers more than the plans the Member picks. A shared plan follows its
 * owner's later edits (`syncSharedPlans`, run when the tab opens).
 */
export function ShareSkillPlansTab({
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
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const stopButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterCommit = useFocusAfterCommit();
  const latest = useRef<Loaded | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const loads = useRef(0);

  const apply = useCallback((next: Loaded) => {
    latest.current = next;
    setLoaded(next);
  }, []);

  const fetchAll = useCallback(async (): Promise<Loaded> => {
    // Refresh the copies of plans edited since they were shared before listing.
    await syncSharedPlans(characterId, communityId);
    const [plans, shared] = await Promise.all([
      db.skillPlans.where('characterId').equals(characterId).toArray(),
      loadMySharedPlans(characterId, communityId),
    ]);
    return { plans, shared: new Set(shared.keys()) };
  }, [characterId, communityId]);

  useEffect(() => {
    const mine = ++loads.current;
    fetchAll().then(
      (next) => {
        if (mine !== loads.current) return;
        apply(next);
        setLoadFailed(false);
      },
      () => {
        if (mine === loads.current) setLoadFailed(true);
      }
    );
  }, [fetchAll, apply]);

  const reload = useCallback(async () => {
    const mine = ++loads.current;
    try {
      const next = await fetchAll();
      if (mine === loads.current) apply(next);
    } catch {
      if (mine === loads.current) setLoadFailed(true);
    }
  }, [fetchAll, apply]);

  /** One change after the one before; a failure reloads the truth rather than guessing an undo. */
  function run(change: (current: Loaded) => Promise<Loaded>): Promise<void> {
    setNotice(null);
    queue.current = queue.current.then(async () => {
      const current = latest.current;
      if (current === null) return;
      try {
        apply(await change(current));
      } catch {
        setNotice(t('communities.plans.failed'));
        await reload();
      }
    });
    return queue.current;
  }

  const needle = query.trim().toLowerCase();
  const sharedRows = useMemo(
    () =>
      loaded
        ? namedLike(
            loaded.plans.filter((plan) => loaded.shared.has(plan.id)),
            needle
          )
        : [],
    [loaded, needle]
  );
  const shownRows = sharedRows.slice(0, ROW_LIMIT);
  const addable = useMemo(
    () =>
      loaded
        ? namedLike(
            loaded.plans.filter((plan) => !loaded.shared.has(plan.id)),
            ''
          )
        : [],
    [loaded]
  );

  if (loadFailed) {
    return (
      <p role="alert" className="text-xs text-danger">
        {t('communities.plans.loadFailed')}
      </p>
    );
  }
  if (loaded === null) return <Spinner size="sm" label={t('communities.plans.loading')} />;

  async function add(current: Loaded, plan: SkillPlanRecord): Promise<Loaded> {
    if (!(await sharePlan(characterId, communityId, plan))) {
      setNotice(t('communities.plans.cannot'));
      return current;
    }
    return { ...current, shared: new Set(current.shared).add(plan.id) };
  }

  async function stop(current: Loaded, plan: SkillPlanRecord): Promise<Loaded> {
    await unsharePlan(characterId, communityId, plan.id);
    const shared = new Set(current.shared);
    shared.delete(plan.id);
    return { ...current, shared };
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-dim">{t('communities.plans.hint')}</p>
      {loaded.plans.length === 0 ? (
        <EmptyState title={t('communities.plans.noPlans')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p role="status" className="text-xs text-text-dim">
              {t('communities.plans.count', { count: loaded.shared.size })}
            </p>
            <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
              {t('communities.plans.add')}
            </Button>
          </div>
          <SearchInput
            ref={search}
            className="w-full"
            value={query}
            placeholder={t('communities.plans.filter')}
            aria-label={t('communities.plans.filter')}
            onChange={(event) => setQuery(event.target.value)}
          />
          {sharedRows.length === 0 ? (
            <EmptyState
              title={
                needle === '' ? t('communities.plans.noneShared') : t('communities.plans.noMatch')
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {shownRows.map((plan, index) => (
                <li key={plan.id} className="flex items-center gap-2 py-1 text-xs">
                  <span className="min-w-0 flex-1 truncate">{plan.name}</span>
                  <span className="text-text-dim">
                    {t('communities.plans.skills', { count: plan.entries.length })}
                  </span>
                  <Button
                    size="sm"
                    ref={(el) => {
                      if (el) stopButtons.current.set(plan.id, el);
                      else stopButtons.current.delete(plan.id);
                    }}
                    onClick={() => {
                      // Stopping removes the row: focus the next Stop sharing, else the search.
                      const near = [shownRows[index + 1], shownRows[index - 1]].map(
                        (other) => () =>
                          other ? (stopButtons.current.get(other.id) ?? null) : null
                      );
                      focusAfterCommit(...near, search);
                      void run((current) => stop(current, plan));
                    }}
                  >
                    {t('communities.plans.stop')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {/* While Add is open the notice shows in it: the page behind is inert. */}
      {notice !== null && !adding && (
        <p role="alert" className="text-xs text-danger">
          {notice}
        </p>
      )}
      <AddSharedItemsDialog
        open={adding}
        onClose={() => setAdding(false)}
        title={t('communities.plans.addTitle')}
        searchLabel={t('communities.plans.addSearch')}
        shareLabel={t('communities.plans.share')}
        nothingToAdd={t('communities.plans.nothingToAdd')}
        notice={notice}
        items={addable.map((plan) => ({
          key: plan.id,
          name: plan.name,
          note: (
            <span className="text-text-dim">
              {t('communities.plans.skills', { count: plan.entries.length })}
            </span>
          ),
        }))}
        onShare={(id) => {
          const plan = addable.find((candidate) => candidate.id === id);
          if (plan) void run((current) => add(current, plan));
        }}
      />
    </div>
  );
}
