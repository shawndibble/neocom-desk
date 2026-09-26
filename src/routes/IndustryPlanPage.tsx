import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { Spinner } from '@/components/ui';
import { useIndustryWorkspace } from '@/features/industry/useIndustryWorkspace';
import { IndustryHeader } from '@/features/industry/IndustryHeader';
import { buildGroupsFor } from '@/features/industry/buildGroups';
import { industryTabHref, type IndustryTab } from '@/features/industry/industryTabs';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { BuildPlanDetail } from '@/features/industry/BuildPlanDetail';
import { applyBuildPlanChange } from '@/features/industry/buildPlanStore';
import type { JobProductionSeed } from '@/features/industry/logProductionFromJob';
import { useQuickbar } from '@/features/market/useQuickbar';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';

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
    pi,
    ownedBlueprints,
    modifiers,
    ownedStockSnapshot,
    corpOwnedStock,
    corpOwnedBlueprints,
    blueprintsNeedsReauth,
  } = workspace;

  // Active Jobs' "Log production…" row action (issue #1787) navigates here
  // with the job's runs/cost in navigation state, for `BuildPlanDetail` to
  // prefill Log Production with. Re-derived every render (not captured once)
  // so a second "Log production…" click that lands on this same route still
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

  const quickbar = useQuickbar(activeCharacterId);
  const [infoModalItem, setInfoModalItem] = useState<{ typeId: number; itemName: string } | null>(
    null
  );

  // Wrapped, not the bare record: Dexie's `get` also resolves to `undefined`
  // for a missing row, and without the wrapper that's indistinguishable from
  // "still loading" — the not-found redirect below would never fire, only an
  // infinite spinner (`SkillPlanEditor.tsx`'s own `planQuery` takes the same
  // shape for the same reason).
  const planQuery = useLiveQuery(async () => {
    if (planId === undefined) return undefined;
    return { plan: await db.buildPlans.get(planId) };
  }, [planId]);

  if (!workspace.hydrated || planQuery === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const plan = planQuery.plan;
  // Deleted elsewhere, a stale URL, or another character's plan — the index
  // is the only page left to send the pilot back to.
  if (!plan || plan.characterId !== activeCharacterId) {
    return <Navigate to={industryTabHref('plans')} replace />;
  }

  const groups = buildGroupsFor(workspace.buildGroups, activeCharacterId);
  const groupSnapshot =
    plan.buildGroupId === undefined
      ? null
      : (groups.find((g) => g.id === plan.buildGroupId)?.snapshot ?? null);

  return (
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
        onAddToQuickbar={quickbar.add}
        quickbarAvailable={quickbar.available}
        onShowInfo={(typeId, itemName) => setInfoModalItem({ typeId, itemName })}
      />

      {!catalog ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <BuildPlanDetail
          key={plan.id}
          plan={plan}
          catalog={catalog}
          pi={pi}
          ownedBlueprints={ownedBlueprints}
          modifiers={modifiers}
          ownedStockSnapshot={ownedStockSnapshot}
          corpOwnedStock={corpOwnedStock}
          corpOwnedBlueprints={corpOwnedBlueprints}
          onChange={(change) => void applyBuildPlanChange(plan.id, change)}
          onAddToQuickbar={quickbar.add}
          quickbarAvailable={quickbar.available}
          onShowInfo={(typeId, itemName) => setInfoModalItem({ typeId, itemName })}
          groupSnapshot={groupSnapshot}
          onSearchBpcSourcing={(typeId) => navigate(bpcSourcingHref(typeId))}
          pendingLogProduction={pendingLogProduction}
          pendingLogProductionKey={location.key}
        />
      )}

      {infoModalItem && (
        <ItemDetailModal
          typeId={infoModalItem.typeId}
          itemName={infoModalItem.itemName}
          onClose={() => setInfoModalItem(null)}
        />
      )}
    </div>
  );
}
