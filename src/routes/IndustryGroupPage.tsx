import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BuildPlanRecord } from '@/db';
import { PageHeader, Spinner, Tabs } from '@/components/ui';
import { useIndustryWorkspace } from '@/features/industry/useIndustryWorkspace';
import { industryTabHref, industryTabs, type IndustryTab } from '@/features/industry/industryTabs';
import {
  buildGroupsFor,
  withGroupCraftSweepDefault,
  withGroupOwnedStock,
  withGroupOwnedStockScope,
} from '@/features/industry/buildGroups';
import { retargetBuildGroup } from '@/features/industry/buildGroupActions';
import { BuildGroupPanel } from '@/features/industry/BuildGroupPanel';
import { applyGroupCraftSweep } from '@/features/industry/craftSweepGroup';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { OwnedStockScope } from '@/engine/industry/types';

const NO_PLANS: BuildPlanRecord[] = [];

/**
 * `/industry/groups/:groupId` — a Build Group's rollup as a full-width page.
 * Replaces the old `/industry` list+detail split; the Members panel opens a
 * plan by navigating to `/industry/plans/:id` rather than swapping an
 * in-memory selection.
 */
export function IndustryGroupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupId } = useParams<{ groupId: string }>();
  const workspace = useIndustryWorkspace();
  const { activeCharacterId, catalog, pi, ownedBlueprints, skills, ownedStockSnapshot } = workspace;

  const plansQuery = useLiveQuery(async () => {
    if (activeCharacterId === null || groupId === undefined) return undefined;
    return db.buildPlans
      .where('characterId')
      .equals(activeCharacterId)
      .filter((p) => p.buildGroupId === groupId)
      .toArray();
  }, [activeCharacterId, groupId]);
  const plans = plansQuery ?? NO_PLANS;

  async function handleRetargetGroup(
    target: Parameters<typeof retargetBuildGroup>[1],
    planIds: readonly string[]
  ) {
    if (activeCharacterId === null || groupId === undefined) return;
    await retargetBuildGroup(groupId, target, planIds, {
      characterId: activeCharacterId,
      buildGroups: workspace.buildGroups,
      setBuildGroups: workspace.setBuildGroups,
    });
  }

  /** @see BuildGroupPanel's `onCraftSweep` doc — same one-shot bulk build/buy control, run once per member. */
  async function handleCraftSweepGroup(options: { strategy: SweepStrategy; depth: number }) {
    if (activeCharacterId === null || groupId === undefined || !catalog) return;
    await workspace.setBuildGroups(
      withGroupCraftSweepDefault(workspace.buildGroups, activeCharacterId, groupId, {
        strategy: options.strategy,
      })
    );
    const picks = await applyGroupCraftSweep(
      plans,
      catalog,
      pi,
      ownedBlueprints,
      skills,
      workspace.assumedMe,
      options
    );
    if (picks.size === 0) return;
    await db.transaction('rw', db.buildPlans, async () => {
      const stored = await db.buildPlans.bulkGet([...picks.keys()]);
      const now = Date.now();
      const updated = stored.flatMap((p) => {
        if (!p) return [];
        const picked = picks.get(p.id);
        return picked ? [{ ...p, buildHere: [...picked], updatedAt: now }] : [];
      });
      await db.buildPlans.bulkPut(updated);
    });
  }

  async function handleGroupOwnedStockChange(ownedStock: Record<number, number>) {
    if (activeCharacterId === null || groupId === undefined) return;
    await workspace.setBuildGroups(
      withGroupOwnedStock(workspace.buildGroups, activeCharacterId, groupId, ownedStock)
    );
  }

  async function handleGroupOwnedStockScopeChange(scope: OwnedStockScope | undefined) {
    if (activeCharacterId === null || groupId === undefined) return;
    await workspace.setBuildGroups(
      withGroupOwnedStockScope(workspace.buildGroups, activeCharacterId, groupId, scope)
    );
  }

  if (!workspace.hydrated || !workspace.buildGroupsHydrated || plansQuery === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;
  if (groupId === undefined) return <Navigate to="/industry" replace />;

  const group = buildGroupsFor(workspace.buildGroups, activeCharacterId).find(
    (g) => g.id === groupId
  );
  // Deleted elsewhere, or a stale URL — the index is the only page left to
  // send the pilot back to (same rule `IndustryPlanPage` follows).
  if (!group) return <Navigate to="/industry" replace />;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={t('nav.industry')} />
      {/* Same reasoning as `IndustryPlanPage`: a group is still conceptually
          inside Build Plans, and the strip is the way back too. */}
      <Tabs
        label={t('nav.industry')}
        value="plans"
        onChange={(id) => navigate(industryTabHref(id as IndustryTab))}
        tabs={industryTabs(t)}
      />

      {!catalog ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <BuildGroupPanel
          key={group.id}
          group={group}
          plans={plans}
          catalog={catalog}
          pi={pi}
          ownedBlueprints={ownedBlueprints}
          skills={skills}
          ownedStockSnapshot={ownedStockSnapshot}
          onOpenPlan={(planId) => navigate(`/industry/plans/${planId}`)}
          onRetarget={(target, planIds) => void handleRetargetGroup(target, planIds)}
          onCraftSweep={(options) => handleCraftSweepGroup(options)}
          onOwnedStockChange={(ownedStock) => void handleGroupOwnedStockChange(ownedStock)}
          onOwnedStockScopeChange={(scope) => void handleGroupOwnedStockScopeChange(scope)}
        />
      )}
    </div>
  );
}
