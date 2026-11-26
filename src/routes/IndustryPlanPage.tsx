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

  const pendingLogProduction =
    (location.state as { logProductionFromJob?: JobProductionSeed } | null)?.logProductionFromJob ??
    null;
  const clearedLogProductionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingLogProduction || !catalog) return;
    if (clearedLogProductionKeyRef.current === location.key) return;
    clearedLogProductionKeyRef.current = location.key;
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reapplication is gated on `location.key` via the ref above, not a dependency list; `pendingLogProduction` is derived from `location.state` each render and would otherwise report false churn
  }, [location.key, catalog]);

  const itemActions = usePageItemActions({ activeCharacterId });

  const planQuery = useLiveQuery(async () => {
    if (planId === undefined) return undefined;
    return { plan: await db.buildPlans.get(planId) };
  }, [planId]);
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
      <div className="mx-auto max-w-page space-y-4">
        <IndustryHeader
          activeCharacterId={activeCharacterId}
          activeTab="plans"
          onTabChange={(id) => navigate(industryTabHref(id as IndustryTab))}
          tabsActivation="manual"
          blueprintsNeedsReauth={blueprintsNeedsReauth}
        />

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
