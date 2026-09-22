import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { Spinner } from '@/components/ui';
import { useIndustryWorkspace } from '@/features/industry/useIndustryWorkspace';
import { IndustryHeader } from '@/features/industry/IndustryHeader';
import { buildGroupsFor } from '@/features/industry/buildGroups';
import { industryTabHref, type IndustryTab } from '@/features/industry/industryTabs';
import { BuildPlanDetail } from '@/features/industry/BuildPlanDetail';
import { applyBuildPlanChange } from '@/features/industry/buildPlanStore';
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
  const { planId } = useParams<{ planId: string }>();
  const workspace = useIndustryWorkspace();
  const {
    activeCharacterId,
    catalog,
    pi,
    ownedBlueprints,
    skills,
    implantBonusPct,
    ownedStockSnapshot,
    corpOwnedStock,
    corpOwnedBlueprints,
    blueprintsNeedsReauth,
  } = workspace;

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
    return <Navigate to="/industry" replace />;
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
          skills={skills}
          implantBonusPct={implantBonusPct}
          ownedStockSnapshot={ownedStockSnapshot}
          corpOwnedStock={corpOwnedStock}
          corpOwnedBlueprints={corpOwnedBlueprints}
          onChange={(change) => void applyBuildPlanChange(plan.id, change)}
          onAddToQuickbar={quickbar.add}
          quickbarAvailable={quickbar.available}
          onShowInfo={(typeId, itemName) => setInfoModalItem({ typeId, itemName })}
          groupSnapshot={groupSnapshot}
          onSearchBpcSourcing={(typeId) => navigate(`/industry?tab=sourcing&bpcSearch=${typeId}`)}
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
