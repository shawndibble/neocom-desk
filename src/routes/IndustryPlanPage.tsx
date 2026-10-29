import { useEffect, useRef } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { DataGate } from '@/components/DataGate';
import { Spinner, TabPanel } from '@/components/ui';
import { useIndustryWorkspace } from '@/features/industry/useIndustryWorkspace';
import { IndustryHeader } from '@/features/industry/IndustryHeader';
import { buildGroupsFor } from '@/features/industry/buildGroups';
import {
  INDUSTRY_TABS_ID,
  industryTabHref,
  type IndustryTab,
} from '@/features/industry/industryTabs';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { BuildPlanDetail } from '@/features/industry/BuildPlanDetail';
import { applyBuildPlanChange } from '@/features/industry/buildPlanStore';
import type { JobProductionSeed } from '@/features/industry/logProductionFromJob';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';

/**
 * `/industry/plans/:planId` — a single Build Plan's own full-width page.
 * Replaces the old `/industry` list+detail split: a plan no longer competes
 * with a 20rem list column and the nav rail for the same screen. Not-found
 * handling mirrors `SkillPlanEditor.tsx`'s: a stale link or another
 * character's plan sends the pilot back to the index rather than showing a
 * dead end.
 */
export function IndustryPlanPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { planId } = useParams<{ planId: string }>();
  const workspace = useIndustryWorkspace();
  const {
    activeCharacterId,
    catalog,
    catalogFailed,
    retryCatalog,
    pi,
    ownedBlueprints,
    modifiers,
    ownedStockSnapshot,
    corpOwnedStock,
    pricingInputs,
    blueprintsNeedsReauth,
  } = workspace;

  // Active Jobs' "Log production" row action (issue #1787) navigates here
  // with the job's runs/cost in navigation state, for `BuildPlanDetail` to
  // prefill Log Production with. Re-derived every render (not captured once)
  // so a second "Log production" click that lands on this same route still
  // carries a fresh seed — `location.key` (passed alongside, below) is what
  // tells `BuildPlanDetail` it's actually new.
  const pendingLogProduction =
    (location.state as { logProductionFromJob?: JobProductionSeed } | null)?.logProductionFromJob ??
    null;
  // Strips the state once `BuildPlanDetail` has had a chance to read it, so
  // revisiting this history entry later (e.g. Back then Forward) doesn't
  // replay it. Gated on `catalog` being ready, not just `location.key`:
  // `BuildPlanDetail` doesn't mount at all until `catalog` loads (the
  // `!catalog` branch below renders a Spinner instead), so clearing any
  // earlier than that would strip the seed before it was ever read.
  const clearedLogProductionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingLogProduction || !catalog) return;
    if (clearedLogProductionKeyRef.current === location.key) return;
    clearedLogProductionKeyRef.current = location.key;
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reapplication is gated on `location.key` via the ref above, not a dependency list; `pendingLogProduction` is derived from `location.state` each render and would otherwise report false churn
  }, [location.key, catalog]);

  const itemActions = usePageItemActions({ activeCharacterId });

  // Wrapped, not the bare record: Dexie's `get` also resolves to `undefined`
  // for a missing row, and without the wrapper that's indistinguishable from
  // "still loading" — the not-found redirect below would never fire, only an
  // infinite spinner (`SkillPlanEditor.tsx`'s own `planQuery` takes the same
  // shape for the same reason).
  const planQuery = useLiveQuery(async () => {
    if (planId === undefined) return undefined;
    return { plan: await db.buildPlans.get(planId) };
  }, [planId]);
  // The plan's Build Group siblings (issue #3992), whose Haves its "Use
  // assets" offer leaves out. Keyed on the group id, read before the early
  // returns so the hook order never changes.
  const buildGroupId = planQuery?.plan?.buildGroupId;
  const groupMembers = useLiveQuery(async () => {
    if (activeCharacterId === null || buildGroupId === undefined) return [];
    return db.buildPlans
      .where('characterId')
      .equals(activeCharacterId)
      .filter((p) => p.buildGroupId === buildGroupId)
      .toArray();
  }, [activeCharacterId, buildGroupId]);

  if (!workspace.hydrated || planQuery === undefined) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const plan = planQuery.plan;
  // Deleted elsewhere, a stale URL, or another character's plan — the index
  // is the only page left to send the pilot back to.
  if (!plan || plan.characterId !== activeCharacterId) {
    return <Navigate to={industryTabHref('plans')} replace />;
  }

  const groups = buildGroupsFor(workspace.buildGroups, activeCharacterId);
  const planGroup =
    plan.buildGroupId === undefined
      ? null
      : (groups.find((g) => g.id === plan.buildGroupId) ?? null);
  const groupSnapshot = planGroup?.snapshot ?? null;

  return (
    <ItemActionsProvider page={itemActions}>
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Same chrome the index shows above its own tab strip — a plan is
            still conceptually inside Build Plans, so moving here should read
            as "the content under the tabs changed," not a jump to a different
            page. Picking another tab navigates back to `/industry` itself. */}
        <IndustryHeader
          activeCharacterId={activeCharacterId}
          activeTab="plans"
          onTabChange={(id) => navigate(industryTabHref(id as IndustryTab))}
          tabsActivation="manual"
          blueprintsNeedsReauth={blueprintsNeedsReauth}
        />

        {/* Waits on the pricing-settings hydration gate too (issue #2054), not
            just the catalog — otherwise this page would price the plan once
            at the default Assumed ME/Include Blueprint Cost and again once
            the pilot's own settings land, the same double-price
            `useComparedBuildResults` avoids for Compare/the index/Group
            Rollups. `pricingInputs.hydrated` resolves quickly and can never
            hang (`buildPlanPricingInputs.ts`'s own doc comment), so this
            never becomes a real wait. */}
        <TabPanel tabsId={INDUSTRY_TABS_ID} tabId="plans" className="space-y-4">
          <DataGate
            status={catalogFailed ? 'failed' : !catalog || !pricingInputs.hydrated ? 'busy' : 'ok'}
            title={t('industry.catalogUnavailable')}
            hint={
              ownedBlueprints.length > 0 ? t('industry.catalogUnavailableOwnedHint') : undefined
            }
            onRetry={retryCatalog}
            resetKey={activeCharacterId}
          >
            {catalog && pricingInputs.hydrated && (
              <BuildPlanDetail
                key={plan.id}
                plan={plan}
                catalog={catalog}
                pi={pi}
                ownedBlueprints={ownedBlueprints}
                modifiers={modifiers}
                ownedStockSnapshot={ownedStockSnapshot}
                corpOwnedStock={corpOwnedStock}
                pricingInputs={pricingInputs}
                onChange={(change) => void applyBuildPlanChange(plan.id, change)}
                groupSnapshot={groupSnapshot}
                group={planGroup}
                // A group change keeps the previous group's rows until the
                // query reruns; never price this plan against them.
                groupMembers={
                  planGroup
                    ? groupMembers?.filter((p) => p.buildGroupId === planGroup.id)
                    : undefined
                }
                onSearchBpcSourcing={(typeId) => navigate(bpcSourcingHref(typeId))}
                pendingLogProduction={pendingLogProduction}
                pendingLogProductionKey={location.key}
              />
            )}
          </DataGate>
        </TabPanel>
      </div>
    </ItemActionsProvider>
  );
}
