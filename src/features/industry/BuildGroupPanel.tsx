/**
 * A **Build Group** opened as one thing: every member's materials merged and
 * its costs summed (issue #626, "Group Rollup" in CONTEXT.md).
 *
 * Prices its members through `useComparedBuildResults`, which already fans out
 * one independent `BuildResult` per plan under `ESI_FANOUT_CONCURRENCY` with
 * per-plan error isolation — the same job Compare does. A second fetch path
 * for the same question would be one more place for a member to be priced
 * differently here than on its own page.
 *
 * A forward estimate, and it says so: Production Runs carry no group and
 * outlive their plans by design, so "what did this fit actually cost" is a
 * question this view cannot answer and must not appear to.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Panel, Spinner } from '@/components/ui';
import type { BuildPlanRecord } from '@/db';
import { rollUpBuildGroup, type BuildGroupMember } from '@/engine/industry/groupRollup';
import type { BuildResult, MaterialCostLine, SkillLevels } from '@/engine/industry/types';
import { writeToClipboard } from '@/lib/clipboard';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { getTradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';
import { nameForType, toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroup } from './buildGroups';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { hasShoppingList, shoppingListText } from './shoppingList';
import { materialTableRows, shoppingListMaterials } from './subBuildPlan';
import { useComparedBuildResults } from './useComparedBuildResults';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';

/**
 * Each member's resolved tree, flattened the two ways the rollup needs.
 *
 * `useComparedBuildResults` settles one plan at a time, so `rows` gets a fresh
 * identity once per member — and without this every already-settled member was
 * re-flattened on each settle. A 25-member fit did ~650 material-tree walks to
 * do 25 members' work.
 *
 * Module-level and keyed on the `BuildResult` itself: a result is replaced
 * wholesale when its plan is repriced, so a cache entry is valid exactly as
 * long as the object it hangs off, and dies with it. Deliberately not
 * `useRef(new WeakMap())`, which allocates a map per render to throw away.
 */
const flattenedByResult = new WeakMap<
  BuildResult,
  { shopping: MaterialCostLine[]; table: MaterialCostLine[] }
>();

function flattenOnce(result: BuildResult) {
  const cached = flattenedByResult.get(result);
  if (cached) return cached;
  const flattened = {
    shopping: shoppingListMaterials(result.materials),
    table: materialTableRows(result.materials),
  };
  flattenedByResult.set(result, flattened);
  return flattened;
}

interface BuildGroupPanelProps {
  group: BuildGroup;
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  pi: PiData | null;
  skills: SkillLevels;
  ownedStockSnapshot: OwnedStockSnapshot;
  /** Opens one member on its own, the way clicking it in the list would. */
  onOpenPlan: (planId: string) => void;
}

export function BuildGroupPanel({
  group,
  plans,
  catalog,
  pi,
  skills,
  ownedStockSnapshot,
  onOpenPlan,
}: BuildGroupPanelProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const rows = useComparedBuildResults({ plans, catalog, pi, skills });

  const members: BuildGroupMember[] = useMemo(() => {
    const byId = new Map(plans.map((p) => [p.id, p]));
    return rows.flatMap((row) => {
      const plan = byId.get(row.planId);
      // A member still loading, or one that could not be priced, contributes
      // nothing rather than contributing zeroes — a total that silently counts
      // a failed member as free is worse than one that says it is incomplete.
      if (!plan || !row.result) return [];
      const flattened = flattenOnce(row.result);
      return [
        {
          planId: row.planId,
          planName: row.planName,
          hubId: plan.hubId,
          result: row.result,
          shoppingMaterials: flattened.shopping,
          tableMaterials: flattened.table,
        },
      ];
    });
  }, [rows, plans]);

  // The members' *blueprint* material types, never the computed cost lines:
  // those get a fresh array identity on every runs/ME keystroke, and an asset
  // list runs to tens of thousands of rows per Character. Sorted, so the array
  // identity the detection hook memoizes on survives a reordering of `plans`.
  const materialTypeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const plan of plans) {
      const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
      if (!entry) continue;
      for (const material of toIndustryBlueprint(entry.blueprint).materials) {
        ids.add(material.typeID);
      }
    }
    return [...ids].sort((a, b) => a - b);
  }, [plans, catalog]);

  // The very detection a single plan's own page runs, over the union of the
  // group's materials — reused rather than re-derived, so a group and its
  // members can never hold two opinions about what the hangar contains.
  const detected = useDetectedOwnedStock(ownedStockSnapshot, materialTypeIds);
  const detectedOwnedStock = useMemo(
    () =>
      detected.stock.size === 0
        ? undefined
        : new Map([...detected.stock].map(([typeID, stock]) => [typeID, stock.quantity])),
    [detected.stock]
  );

  const rollup = useMemo(
    () => rollUpBuildGroup(members, { detectedOwnedStock }),
    [members, detectedOwnedStock]
  );

  const rowByPlanId = useMemo(() => new Map(rows.map((row) => [row.planId, row])), [rows]);
  const loading = rows.some((row) => row.loading);
  const failed = rows.filter((row) => row.error !== null);
  const canCopy = rollup.singleHub && hasShoppingList(rollup.shoppingMaterials);

  async function handleCopy() {
    await writeToClipboard(
      shoppingListText(rollup.shoppingMaterials, (id) => nameForType(catalog, id))
    );
    setCopied(true);
  }

  if (plans.length === 0) {
    return (
      <Panel title={group.name}>
        <EmptyState
          title={t('industry.groupEmptyTitle')}
          hint={t('industry.groupEmptyHint')}
          className="py-6"
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title={group.name}
        meta={t('industry.groupMemberCount', { count: plans.length })}
        actions={
          <Button size="sm" onClick={() => void handleCopy()} disabled={!canCopy}>
            {copied ? t('industry.copyShoppingListDone') : t('industry.copyShoppingList')}
          </Button>
        }
      >
        {loading && (
          <div className="flex justify-center py-4">
            <Spinner label={t('common.loading')} />
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-text-dim">{t('industry.materialCost')}</dt>
            <dd className="tabular-nums">{formatIsk(rollup.materialCost)}</dd>
          </div>
          <div>
            <dt className="text-text-dim">{t('industry.groupJobFees')}</dt>
            <dd className="tabular-nums">{formatIsk(rollup.topLevelJobFees)}</dd>
          </div>
          <div>
            <dt className="text-text-dim">{t('industry.totalCost')}</dt>
            <dd className="font-semibold tabular-nums">{formatIsk(rollup.totalCost)}</dd>
          </div>
          <div>
            <dt className="text-text-dim">{t('industry.groupJobTime')}</dt>
            <dd className="tabular-nums">{formatDuration(rollup.seconds)}</dd>
          </div>
          {/* What the same fit costs bought outright — the group's own
              Acquisition Verdict, and the comparison a pilot pasting a fit is
              actually making. Null when any member's product is unpriced,
              because a partial sum shown as a whole is worse than none. */}
          <div>
            <dt className="text-text-dim">{t('industry.groupBuyCost')}</dt>
            <dd className="tabular-nums">
              {rollup.buyCost === null ? t('industry.unpriced') : formatIsk(rollup.buyCost)}
            </dd>
          </div>
        </dl>

        <p className="mt-2 text-xs text-text-dim">{t('industry.groupEstimateNote')}</p>

        {!rollup.singleHub && (
          <p role="alert" className="mt-2 text-xs text-warning">
            {t('industry.groupMixedHubs', {
              // `systemName`, which hubs.ts keeps for exactly this — the full
              // station name ("Jita IV - Moon 4 - Caldari Navy Assembly
              // Plant") would bury the sentence it appears in.
              hubs: rollup.hubIds.map((id) => getTradeHub(id)?.systemName ?? id).join(', '),
            })}
          </p>
        )}
        {rollup.unpriceable && (
          <p className="mt-2 text-xs text-warning">{t('industry.groupUnpriceable')}</p>
        )}
        {rollup.overClaimed.length > 0 && (
          <p className="mt-2 text-xs text-warning">
            {t('industry.groupOverClaimed', {
              materials: rollup.overClaimed.map((id) => nameForType(catalog, id)).join(', '),
            })}
          </p>
        )}
        {failed.length > 0 && (
          <ul className="mt-2 text-xs text-danger">
            {failed.map((row) => (
              <li key={row.planId}>{t('industry.compareUnresolvedFor', { plan: row.planName })}</li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t('industry.groupMembers')} padded={false}>
        <ul className="divide-y divide-line text-xs">
          {plans.map((plan) => {
            const row = rowByPlanId.get(plan.id);
            return (
              <li key={plan.id}>
                <button
                  type="button"
                  onClick={() => onOpenPlan(plan.id)}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-panel-2"
                >
                  <span className="truncate">{plan.name}</span>
                  <span className="shrink-0 tabular-nums text-text-dim">
                    {row?.result ? formatIsk(row.result.totalCost) : '—'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* The whole merge, built materials included — `tableMaterials`, not the
          buy list. The two are only the same where no member builds anything,
          and mixing them into one number double-counts the moment one member
          buys what another member's sub-job also consumes. The copy control
          above pastes `shoppingMaterials`, which is the leaves alone. */}
      <Panel title={t('industry.groupMaterials')} padded={false}>
        {rollup.tableMaterials.length === 0 ? (
          <EmptyState title={t('industry.groupNothingToBuy')} className="py-6" />
        ) : (
          <ul className="divide-y divide-line text-xs">
            {rollup.tableMaterials.map((material) => (
              <li key={material.typeID} className="flex justify-between gap-2 px-2.5 py-1.5">
                <span className="truncate">{nameForType(catalog, material.typeID)}</span>
                <span className="shrink-0 tabular-nums text-text-dim">
                  {t('industry.groupMaterialNeed', {
                    quantity: material.quantity.toLocaleString(),
                    remaining: material.remainingQuantity.toLocaleString(),
                  })}
                  {material.unpriced ? ` · ${t('industry.unpriced')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
