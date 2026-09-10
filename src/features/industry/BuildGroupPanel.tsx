/**
 * A **Build Group** opened as one thing: every member's materials merged and
 * its costs summed (issue #626, "Group Rollup" in CONTEXT.md).
 *
 * Prices its members through `useComparedBuildResults`, which computes one
 * independent `BuildResult` per plan with per-plan error isolation, off a
 * single batched price fetch shared by every member at the same hub (issue
 * #628) — the same job Compare does. A second fetch path for the same
 * question would be one more place for a member to be priced differently
 * here than on its own page.
 *
 * A forward estimate, and it says so: Production Runs carry no group and
 * outlive their plans by design, so "what did this fit actually cost" is a
 * question this view cannot answer and must not appear to.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Panel, Spinner } from '@/components/ui';
import type { BuildPlanRecord } from '@/db';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import { rollUpBuildGroup, type BuildGroupMember } from '@/engine/industry/groupRollup';
import type { BuildResult, MaterialCostLine, SkillLevels } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { writeToClipboard } from '@/lib/clipboard';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { getTradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';
import { useAssumedMe } from './assumedMe';
import { nameForType, toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroup } from './buildGroups';
import { CraftSweepControl, type DepthChoice } from './CraftSweepControl';
import { groupCraftSweepMaxDepth } from './craftSweepGroup';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { recipeForLookup } from './recipes';
import { hasShoppingList, shoppingListText } from './shoppingList';
import { materialTableRows, shoppingListMaterials } from './subBuildPlan';
import { useComparedBuildResults } from './useComparedBuildResults';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';
import { RetargetGroupDialog, type RetargetTarget } from './RetargetGroupDialog';

/**
 * Each member's resolved tree, flattened the two ways the rollup needs.
 *
 * `useComparedBuildResults` settles each member into `rows` on its own, so
 * `rows` gets a fresh identity per settle — and without this every
 * already-settled member was re-flattened on each one. A 25-member fit did
 * ~650 material-tree walks to do 25 members' work. Members sharing a hub now
 * share one fetch and so tend to settle together, which shortens that run but
 * does not remove it: a mixed-hub group still settles hub by hub.
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

/** The whole-group copy control's key in `copyState`; no hub can collide with it. */
const GROUP_COPY = 'group';

type CopyStatus = 'copied' | 'failed';

/**
 * `systemName`, which hubs.ts keeps for exactly this — the full station name
 * ("Jita IV - Moon 4 - Caldari Navy Assembly Plant") would bury the sentence
 * it appears in and would not fit on a button at all.
 */
function hubLabel(hubId: string): string {
  return getTradeHub(hubId)?.systemName ?? hubId;
}

interface BuildGroupPanelProps {
  group: BuildGroup;
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  skills: SkillLevels;
  ownedStockSnapshot: OwnedStockSnapshot;
  /** Opens one member on its own, the way clicking it in the list would. */
  onOpenPlan: (planId: string) => void;
  /** "Retarget group" (issue #632): bulk-writes `target` onto every plan in `planIds`. */
  onRetarget: (target: RetargetTarget, planIds: string[]) => void;
  /**
   * Craft Sweep on the group (issue #696): applies one Sweep Strategy +
   * Sweep Depth to every member independently. Returns a Promise so this
   * panel can disable the control for the duration, the same way a
   * synchronous single-plan Apply never needs to.
   */
  onCraftSweep: (options: {
    strategy: SweepStrategy;
    depth: number;
    depthChoice: DepthChoice;
  }) => Promise<void>;
}

export function BuildGroupPanel({
  group,
  plans,
  catalog,
  pi,
  ownedBlueprints,
  skills,
  ownedStockSnapshot,
  onOpenPlan,
  onRetarget,
  onCraftSweep,
}: BuildGroupPanelProps) {
  const { t } = useTranslation();
  // Which list the outcome belongs to, not a bare flag: a mixed-hub group
  // shows one copy control per hub, and a shared flag would report Amarr as
  // copied the moment Jita was. `GROUP_COPY` is the whole-group control's key.
  const [copyState, setCopyState] = useState<{ key: string; status: CopyStatus } | null>(null);
  const [retargeting, setRetargeting] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const rows = useComparedBuildResults({ plans, catalog, pi, ownedBlueprints, skills });

  // Same setting `useComparedBuildResults` reads for these members' own
  // pricing — sub-builds unowned anywhere in the group must assume the same
  // ME that hook already quotes them at.
  const assumedMe = useAssumedMe((state) => state.value);
  const recipeFor = useMemo(
    () => recipeForLookup({ catalog, pi, ownedBlueprints, assumedMeForUnowned: assumedMe }),
    [catalog, pi, ownedBlueprints, assumedMe]
  );

  // Sweep Depth is structural — which typeIDs have a recipe — and never
  // moves with a member's runs/ME/hub/sourcing edit, so this keys on the
  // blueprints actually in play rather than on `plans` itself: `plans` gets
  // a fresh array identity from `useLiveQuery` on every keystroke in any
  // member, and `groupCraftSweepMaxDepth` walks every member's full tree —
  // exactly the O(members) tree-walk cost `flattenedByResult` above exists
  // to avoid for the rollup's own flattening.
  const craftSweepBlueprintSignature = plans.map((p) => `${p.blueprintTypeID}`).join(',');
  const craftSweepMaxDepth = useMemo(
    () => groupCraftSweepMaxDepth(plans, catalog, recipeFor, skills),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- craftSweepBlueprintSignature is the stable proxy for `plans`' structural identity; see comment above.
    [craftSweepBlueprintSignature, catalog, recipeFor, skills]
  );
  // What Apply will actually touch: `applyGroupCraftSweep` silently skips a
  // member whose blueprint no longer resolves in the catalog (the same
  // "skip, don't zero" policy the rollup itself applies to an unresolvable
  // member), so the confirmation must count survivors, not every plan in the
  // group, or it would overstate its own blast radius.
  const craftSweepAffectedCount = plans.filter((p) =>
    catalog.byBlueprintTypeID.has(p.blueprintTypeID)
  ).length;

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

  // The copy outcome is a flash, not a state the panel keeps. Cleared by an
  // effect rather than a `setTimeout` in the handler, so unmounting mid-flash
  // — or copying another hub before it fades — cancels the pending timer
  // instead of setting state on a gone component.
  useEffect(() => {
    if (copyState === null) return;
    const timer = setTimeout(() => setCopyState(null), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const rowByPlanId = useMemo(() => new Map(rows.map((row) => [row.planId, row])), [rows]);
  const loading = rows.some((row) => row.loading);
  const failed = rows.filter((row) => row.error !== null);

  // Hubs with a member still loading, or one that could not be priced. Such a
  // member contributes nothing to the rollup (see `members` above), so its
  // hub's list is real but incomplete, and a paste made now would quietly be
  // short those units — the same reason a single plan's copy waits for its own
  // result. Tracked per hub, so one hub's unresolved member does not withhold
  // another hub's perfectly complete list.
  const incompleteHubs = useMemo(() => {
    const settled = new Set(members.map((member) => member.planId));
    const hubs = new Set<string>();
    for (const plan of plans) if (!settled.has(plan.id)) hubs.add(plan.hubId);
    return hubs;
  }, [members, plans]);

  const canCopy =
    rollup.singleHub && incompleteHubs.size === 0 && hasShoppingList(rollup.shoppingMaterials);

  // The rejection is caught and shown, not left to `void`, exactly as the
  // single plan's copy does it: a browser that denies clipboard access, or a
  // page that lost focus between the click and the write, is a real path, and
  // a button that silently keeps reading "Copy" reports success it never had.
  async function handleCopy(key: string, materials: readonly MaterialCostLine[]) {
    try {
      await writeToClipboard(shoppingListText(materials, (id) => nameForType(catalog, id)));
      setCopyState({ key, status: 'copied' });
    } catch {
      setCopyState({ key, status: 'failed' });
    }
  }

  /** Whether `key`'s control is the one the last copy attempt belongs to. */
  function copyStatusFor(key: string): CopyStatus | null {
    return copyState?.key === key ? copyState.status : null;
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
          <>
            <Button size="sm" onClick={() => setRetargeting(true)}>
              {t('industry.retargetGroupAction')}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleCopy(GROUP_COPY, rollup.shoppingMaterials)}
              disabled={!canCopy}
            >
              {copyStatusFor(GROUP_COPY) === 'copied'
                ? t('industry.copyShoppingListDone')
                : t('industry.copyShoppingList')}
            </Button>
          </>
        }
      >
        {loading && (
          <div className="flex justify-center py-4">
            <Spinner label={t('common.loading')} />
          </div>
        )}

        <div className="mb-3">
          <CraftSweepControl
            maxDepth={craftSweepMaxDepth}
            disabled={sweeping}
            initialStrategy={group.craftSweepDefault?.strategy}
            initialDepthChoice={group.craftSweepDefault?.depthChoice}
            confirmMessage={t('industry.craftSweepConfirmGroup', {
              count: craftSweepAffectedCount,
            })}
            onApply={(options) => {
              setSweeping(true);
              void onCraftSweep(options).finally(() => setSweeping(false));
            }}
          />
        </div>

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

        {/* Shown as a line rather than as the button's own label: the message
            is about the clipboard, not about which list, and it is a sentence
            long — it would not fit on any of the controls that can raise it. */}
        {copyState?.status === 'failed' && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {t('industry.copyShoppingListFailed')}
          </p>
        )}

        {/* A mixture is a shopping trip with two stops, not a dead end (issue
            #631). The header control above stays disabled — there is no one
            list it could copy — and each hub gets its own paste here rather
            than in `actions`, where five buttons would not survive a phone. */}
        {!rollup.singleHub && (
          <div className="mt-2 space-y-2">
            <p role="alert" className="text-xs text-warning">
              {t('industry.groupMixedHubs', {
                hubs: rollup.hubIds.map(hubLabel).join(', '),
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              {rollup.shoppingByHub.map((block) => (
                <Button
                  key={block.hubId}
                  size="sm"
                  onClick={() => void handleCopy(block.hubId, block.materials)}
                  // Same rules as the whole-group control: a hub whose every
                  // material is already owned would copy an empty string, and
                  // one still missing a member would copy a short list.
                  disabled={incompleteHubs.has(block.hubId) || !hasShoppingList(block.materials)}
                >
                  {copyStatusFor(block.hubId) === 'copied'
                    ? t('industry.copyHubShoppingListDone', { hub: hubLabel(block.hubId) })
                    : t('industry.copyHubShoppingList', { hub: hubLabel(block.hubId) })}
                </Button>
              ))}
            </div>
          </div>
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

      {retargeting && (
        <RetargetGroupDialog
          group={group}
          plans={plans}
          onApply={(target, planIds) => {
            onRetarget(target, planIds);
            setRetargeting(false);
          }}
          onClose={() => setRetargeting(false)}
        />
      )}
    </div>
  );
}
