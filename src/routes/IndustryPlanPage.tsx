import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { scheduleSync } from '@/sync';
import { Spinner } from '@/components/ui';
import { useIndustryWorkspace } from '@/features/industry/useIndustryWorkspace';
import { buildGroupsFor } from '@/features/industry/buildGroups';
import {
  BuildPlanDetail,
  type PlanPatch,
  type SourcingPatchEntry,
} from '@/features/industry/BuildPlanDetail';
import { saveSourcingEdit } from '@/features/industry/sourcingEdits';
import type { MaterialSourcing } from '@/engine/industry/types';
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
  const { planId } = useParams<{ planId: string }>();
  const workspace = useIndustryWorkspace();
  const {
    activeCharacterId,
    catalog,
    pi,
    ownedBlueprints,
    skills,
    ownedStockSnapshot,
    corpOwnedStock,
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

  async function writePlanPatch(patch: PlanPatch, touch: boolean) {
    if (planId === undefined) return;
    await db.transaction('rw', db.buildPlans, async () => {
      const stored = await db.buildPlans.get(planId);
      if (!stored) return;
      await db.buildPlans.put({ ...stored, ...patch, ...(touch ? { updatedAt: Date.now() } : {}) });
    });
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
  }

  async function handleSourcingChangeMany(patches: readonly SourcingPatchEntry[]) {
    if (planId === undefined) return;
    for (const { typeID, patch } of patches) {
      await saveSourcingEdit(planId, typeID, patch);
    }
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
  }

  async function handleSourcingChange(typeID: number, patch: MaterialSourcing) {
    if (planId === undefined) return;
    await saveSourcingEdit(planId, typeID, patch);
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
  }

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
    <div className="mx-auto max-w-7xl space-y-3">
      <Link to="/industry" className="inline-block text-xs text-accent hover:underline">
        {t('industry.backToList')}
      </Link>

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
          ownedStockSnapshot={ownedStockSnapshot}
          corpOwnedStock={corpOwnedStock}
          onUpdate={(patch) => void writePlanPatch(patch, true)}
          onDerivedFix={(patch) => void writePlanPatch(patch, false)}
          onSourcingChange={(typeID, patch) => void handleSourcingChange(typeID, patch)}
          onSourcingChangeMany={(patches) => void handleSourcingChangeMany(patches)}
          onAddToQuickbar={quickbar.add}
          quickbarAvailable={quickbar.available}
          onShowInfo={(typeId, itemName) => setInfoModalItem({ typeId, itemName })}
          groupSnapshot={groupSnapshot}
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
