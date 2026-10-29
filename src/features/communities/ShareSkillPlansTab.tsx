import { useCallback, useMemo, useRef, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, buttonClassName, EmptyState, SearchInput, Spinner } from '@/components/ui';
import { db, type SkillPlanRecord } from '@/db';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { AddSharedItemsDialog } from './AddSharedItemsDialog';
import { namedLike, needleOf, ROW_LIMIT } from './shareLists';
import { useSerialShareState } from './useSerialShareState';
import { loadMySharedPlans, sharePlan, syncSharedPlans, unsharePlan } from './sharedPlans';

interface Loaded {
  plans: SkillPlanRecord[];
  /** Plan ids this Character has in the Community. */
  shared: Set<string>;
}

/**
 * The Skill plans tab's My sharing: what this Character shares, one row per
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
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const stopButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterCommit = useFocusAfterCommit();

  const fetchAll = useCallback(async (): Promise<Loaded> => {
    // Refresh the copies of plans edited since they were shared before listing.
    await syncSharedPlans(characterId, communityId);
    const [plans, shared] = await Promise.all([
      db.skillPlans.where('characterId').equals(characterId).toArray(),
      loadMySharedPlans(characterId, communityId),
    ]);
    return { plans, shared: new Set(shared.keys()) };
  }, [characterId, communityId]);
  const { loaded, loadFailed, notice, setNotice, run } = useSerialShareState(
    fetchAll,
    'communities.plans.failed'
  );

  const needle = needleOf(query);
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
    return <InlineError>{t('communities.plans.loadFailed')}</InlineError>;
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

  // With no plans of its own the pilot needs somewhere to make one.
  const makePlan = (
    <Link to="/skills/plans" className={buttonClassName({ size: 'sm' })}>
      {t('communities.plans.makePlan')}
    </Link>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-dim">{t('communities.plans.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="text-xs text-text-dim">
          {t('communities.plans.count', { count: loaded.shared.size })}
        </p>
        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          {t('communities.plans.add')}
        </Button>
      </div>
      {loaded.plans.length === 0 ? (
        <EmptyState title={t('communities.plans.noPlans')} action={makePlan} />
      ) : (
        <>
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
      {notice !== null && !adding && <InlineError>{notice}</InlineError>}
      <AddSharedItemsDialog
        open={adding}
        onClose={() => setAdding(false)}
        title={t('communities.plans.addTitle')}
        searchLabel={t('communities.plans.addSearch')}
        shareLabel={t('communities.plans.share')}
        nothingToAdd={
          loaded.plans.length === 0
            ? t('communities.plans.noPlans')
            : t('communities.plans.nothingToAdd')
        }
        nothingAction={loaded.plans.length === 0 ? makePlan : undefined}
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
