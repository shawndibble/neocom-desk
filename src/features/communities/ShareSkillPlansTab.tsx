import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, EmptyState, SearchInput, Spinner } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { db, type SkillPlanRecord } from '@/db';
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
 * The Skill plans tab of a Community: what this Character shares, one row per
 * plan with Stop sharing, and a search that adds a plan. Unlike Blueprints and
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
  const addable = useMemo(
    () =>
      loaded && needle !== ''
        ? namedLike(
            loaded.plans.filter((plan) => !loaded.shared.has(plan.id)),
            needle
          )
        : [],
    [loaded, needle]
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
      <p className="text-xs">
        <Link to="/skills/plans?browse=community" className={inlineLinkClassName}>
          {t('communities.plans.browse')}
        </Link>
        <span className="text-text-dim"> · {t('communities.plans.browseHint')}</span>
      </p>
      {loaded.plans.length === 0 ? (
        <EmptyState title={t('communities.plans.noPlans')} />
      ) : (
        <>
          <p role="status" className="text-xs text-text-dim">
            {t('communities.plans.count', { count: loaded.shared.size })}
          </p>
          <SearchInput
            className="w-full"
            value={query}
            placeholder={t('communities.plans.search')}
            aria-label={t('communities.plans.search')}
            onChange={(event) => setQuery(event.target.value)}
          />
          {addable.length > 0 && (
            <section aria-label={t('communities.plans.addable')} className="space-y-1">
              <h3 className="text-xs font-semibold">{t('communities.plans.addable')}</h3>
              <ul className="divide-y divide-line">
                {addable.slice(0, ROW_LIMIT).map((plan) => (
                  <li key={plan.id} className="flex items-center gap-2 py-1 text-xs">
                    <span className="min-w-0 flex-1 truncate">{plan.name}</span>
                    <span className="text-text-dim">
                      {t('communities.plans.skills', { count: plan.entries.length })}
                    </span>
                    <Button size="sm" onClick={() => void run((current) => add(current, plan))}>
                      {t('communities.plans.share')}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {sharedRows.length === 0 ? (
            <EmptyState
              title={
                needle === '' ? t('communities.plans.noneShared') : t('communities.plans.noMatch')
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {sharedRows.slice(0, ROW_LIMIT).map((plan) => (
                <li key={plan.id} className="flex items-center gap-2 py-1 text-xs">
                  <span className="min-w-0 flex-1 truncate">{plan.name}</span>
                  <span className="text-text-dim">
                    {t('communities.plans.skills', { count: plan.entries.length })}
                  </span>
                  <Button size="sm" onClick={() => void run((current) => stop(current, plan))}>
                    {t('communities.plans.stop')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {notice !== null && (
        <p role="alert" className="text-xs text-danger">
          {notice}
        </p>
      )}
    </div>
  );
}
