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
import {
  filterStockByScope,
  suggestedOwnedQuantity,
  type OwnedStockScope,
} from '@/engine/industry/ownedStock';
import type { MaterialCostLine, SkillLevels } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { writeToClipboard } from '@/lib/clipboard';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';
import { getTradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';
import { useAssumedMe } from './assumedMe';
import { nameForType, toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroup } from './buildGroups';
import { CraftSweepControl, type DepthChoice } from './CraftSweepControl';
import { groupCraftScope, groupCraftSweepMaxDepth } from './craftSweepGroup';
import { SourcingInput } from './MaterialsTable';
import { OwnedStockScopeControl } from './OwnedStockScopeControl';
import { stockLocationLabel, type OwnedStockSnapshot } from './ownedStockDetection';
import type { OwnedStockDetection } from './ownedStockDetection';
import { recipeForLookup } from './recipes';
import { flattenBuildResult } from './resultFlattenCache';
import { hasShoppingList, shoppingListText } from './shoppingList';
import { useComparedBuildResults } from './useComparedBuildResults';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';
import { RetargetGroupDialog, type RetargetTarget } from './RetargetGroupDialog';

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
  /**
   * Group Owned Overlay (issue #697): writes the group's own owned-stock
   * ledger, replacing it wholesale — the same "replace, don't merge"
   * contract `withGroupOwnedStock` keeps.
   */
  onOwnedStockChange: (ownedStock: Record<number, number>) => void;
  /** @see BuildGroupPanelProps.onOwnedStockChange */
  onOwnedStockScopeChange: (scope: OwnedStockScope | undefined) => void;
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
  onOwnedStockChange,
  onOwnedStockScopeChange,
}: BuildGroupPanelProps) {
  const { t } = useTranslation();
  // Which list the outcome belongs to, not a bare flag: a mixed-hub group
  // shows one copy control per hub, and a shared flag would report Amarr as
  // copied the moment Jita was. `GROUP_COPY` is the whole-group control's key.
  const [copyState, setCopyState] = useState<{ key: string; status: CopyStatus } | null>(null);
  const [retargeting, setRetargeting] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  // computeGroupResult: true — the group total needs each member's tree
  // re-resolved with owned-stock deduction disabled (issue #697), never the
  // owned-netted `result` a member's own page shows (still read below, for
  // the member list's own totals).
  const rows = useComparedBuildResults({
    plans,
    catalog,
    pi,
    ownedBlueprints,
    skills,
    computeGroupResult: true,
  });

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
  // exactly the O(members) tree-walk cost `resultFlattenCache` exists to
  // avoid for the rollup's own flattening.
  const craftSweepBlueprintSignature = plans.map((p) => `${p.blueprintTypeID}`).join(',');
  const craftSweepMaxDepth = useMemo(
    () => groupCraftSweepMaxDepth(plans, catalog, recipeFor, skills),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- craftSweepBlueprintSignature is the stable proxy for `plans`' structural identity; see comment above.
    [craftSweepBlueprintSignature, catalog, recipeFor, skills]
  );
  // Craft Scope's Reactions chip (issue #698): lit whenever any single member
  // is eligible, keyed on each member's own flag too, unlike the signature
  // above — depth is structural, but eligibility follows Include Reactions.
  const craftSweepScopeSignature = plans
    .map((p) => `${p.blueprintTypeID}:${p.includeReactions ?? false}`)
    .join(',');
  const craftSweepScope = useMemo(
    () => groupCraftScope(plans, catalog),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- craftSweepScopeSignature is the stable proxy for `plans`' structural identity; see comment above.
    [craftSweepScopeSignature, catalog]
  );
  // What Apply will actually touch: `applyGroupCraftSweep` silently skips a
  // member whose blueprint no longer resolves in the catalog (the same
  // "skip, don't zero" policy the rollup itself applies to an unresolvable
  // member), so the confirmation must count survivors, not every plan in the
  // group, or it would overstate its own blast radius.
  const craftSweepAffectedCount = plans.filter((p) =>
    catalog.byBlueprintTypeID.has(p.blueprintTypeID)
  ).length;

  // `tableMaterials` widens to `MaterialCostLine[]` at the `BuildGroupMember`
  // boundary (`groupRollup.ts` stays free of feature types), which loses
  // `subBuilds` for anyone reading it back off `members` — so this is
  // computed here, off `flattened.table` while it is still a
  // `MaterialTableRow[]`, rather than downstream. Summed by typeID across
  // members the same way `mergeMaterials` sums quantity, since a material one
  // member builds is still built no matter how many members contribute it.
  const { members, builtQuantityByType } = useMemo(() => {
    const byId = new Map(plans.map((p) => [p.id, p]));
    const builtQuantityByType = new Map<number, number>();
    const members: BuildGroupMember[] = [];
    for (const row of rows) {
      const plan = byId.get(row.planId);
      // A member still loading, or one that could not be priced, contributes
      // nothing rather than contributing zeroes — a total that silently counts
      // a failed member as free is worse than one that says it is incomplete.
      // `groupResult`, never `result`: the group total re-resolves each
      // member with owned-stock deduction disabled (issue #697) — `result`
      // is what that member's own page shows, still netted against its own
      // `materialSourcing`, and stays untouched in the member list below.
      if (!plan || !row.groupResult) continue;
      const flattened = flattenBuildResult(row.groupResult);
      for (const material of flattened.table) {
        if (material.subBuilds.length === 0) continue;
        builtQuantityByType.set(
          material.typeID,
          (builtQuantityByType.get(material.typeID) ?? 0) + material.quantity
        );
      }
      members.push({
        planId: row.planId,
        planName: row.planName,
        hubId: plan.hubId,
        result: row.groupResult,
        shoppingMaterials: flattened.shopping,
        tableMaterials: flattened.table,
      });
    }
    return { members, builtQuantityByType };
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
  // members can never hold two opinions about what the hangar contains. Feeds
  // the Group Owned Overlay's own ledger UI below (issue #697), not the
  // rollup directly — `rollUpBuildGroup` only ever sees the ledger the pilot
  // has committed to, in `ownedStockMap`.
  const detected = useDetectedOwnedStock(ownedStockSnapshot, materialTypeIds);
  const scopedStock = useMemo(
    () => filterStockByScope(detected.stock, group.ownedStockScope),
    [detected.stock, group.ownedStockScope]
  );
  const detection = useMemo<OwnedStockDetection>(
    () => ({
      stockFor: (typeID) => detected.stock.get(typeID),
      scopedQuantityFor: (typeID) => scopedStock.get(typeID)?.quantity ?? 0,
      lowerBound: detected.incompleteCharacters.length > 0,
      incompleteCharacters: detected.incompleteCharacters,
      characterNameFor: (characterId) =>
        detected.characterNames.get(characterId) ?? t('common.unknown'),
      locationLabelFor: (placement) => stockLocationLabel(placement, detected.locationNames, t),
    }),
    [detected, scopedStock, t]
  );

  const ownedStockMap = useMemo(
    () =>
      new Map(Object.entries(group.ownedStock ?? {}).map(([typeID, qty]) => [Number(typeID), qty])),
    [group.ownedStock]
  );

  const rollup = useMemo(
    () => rollUpBuildGroup(members, { ownedStock: ownedStockMap }),
    [members, ownedStockMap]
  );

  /** One write path for the ledger: every caller mutates a copy of `group.ownedStock`, this commits it. */
  function updateOwnedStock(mutate: (next: Record<number, number>) => void) {
    const next: Record<number, number> = { ...group.ownedStock };
    mutate(next);
    onOwnedStockChange(next);
  }

  function setOwnedQuantity(typeID: number, quantity: number | undefined) {
    updateOwnedStock((next) => {
      if (quantity === undefined || quantity <= 0) delete next[typeID];
      else next[typeID] = quantity;
    });
  }

  // Same "never clobber a hand-typed value" rule the plan-level bulk fill
  // keeps: only rows with nothing in the ledger yet are offered.
  const bulkDetectedEntries = useMemo(
    () =>
      rollup.tableMaterials
        .filter((m) => ownedStockMap.get(m.typeID) === undefined && scopedStock.has(m.typeID))
        .map(
          (m) =>
            [
              m.typeID,
              suggestedOwnedQuantity(scopedStock.get(m.typeID)!.quantity, m.quantity),
            ] as const
        ),
    [rollup.tableMaterials, ownedStockMap, scopedStock]
  );
  const bulkClearTypeIds = useMemo(
    () =>
      rollup.tableMaterials
        .filter((m) => (ownedStockMap.get(m.typeID) ?? 0) > 0)
        .map((m) => m.typeID),
    [rollup.tableMaterials, ownedStockMap]
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
            scope={craftSweepScope}
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

      {/* The Group Owned Overlay (issue #697): the group's own "I own this"
          ledger, independent of any member's per-plan owned quantity — see
          CONTEXT.md's "Group Owned Overlay". Manual entry, or "use detected"
          scoped the same way a single plan's owned-stock entry is. */}
      <Panel title={t('industry.groupOwnedStockTitle')} padded={false}>
        <div className="space-y-3 p-2.5">
          <OwnedStockScopeControl
            scope={group.ownedStockScope}
            detectedStock={detected.stock}
            detection={detection}
            onChange={onOwnedStockScopeChange}
            action={
              (bulkDetectedEntries.length > 0 || bulkClearTypeIds.length > 0) && (
                <div className="flex gap-2">
                  {bulkDetectedEntries.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() =>
                        updateOwnedStock((next) => {
                          for (const [typeID, quantity] of bulkDetectedEntries)
                            next[typeID] = quantity;
                        })
                      }
                    >
                      {t('industry.useAllOwned')}
                    </Button>
                  )}
                  {bulkClearTypeIds.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() =>
                        updateOwnedStock((next) => {
                          for (const typeID of bulkClearTypeIds) delete next[typeID];
                        })
                      }
                    >
                      {t('industry.useNoneOwned')}
                    </Button>
                  )}
                </div>
              )
            }
          />
          {rollup.tableMaterials.length === 0 ? (
            <EmptyState title={t('industry.groupNothingToBuy')} className="py-4" />
          ) : (
            <ul className="divide-y divide-line text-xs">
              {rollup.tableMaterials.map((material) => (
                <li
                  key={material.typeID}
                  className="flex items-center justify-between gap-2 py-1.5"
                >
                  <span className="truncate">{nameForType(catalog, material.typeID)}</span>
                  <SourcingInput
                    value={ownedStockMap.get(material.typeID)}
                    label={t('industry.groupOwnedQuantityLabel', {
                      material: nameForType(catalog, material.typeID),
                    })}
                    inputMode="numeric"
                    widthClassName="w-20"
                    placeholder="0"
                    parse={(raw) => {
                      const value = unmaskNumber(raw);
                      return value === undefined ? undefined : Math.floor(value);
                    }}
                    onCommit={(quantity) => setOwnedQuantity(material.typeID, quantity)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
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
            {rollup.tableMaterials.map((material) => {
              // A row some member builds rather than buys: `remainingQuantity`
              // still carries `resolveMaterial`'s bought-line formula (quantity
              // minus owned), so rendering it as a buy count here would repeat
              // the per-plan table's bug (`MaterialsTable.tsx`'s own
              // `subBuilds.length > 0` check) — only display, not the ledger
              // math, is corrected: `rollup.tableMaterials` itself is untouched.
              //
              // A typeID can be built by one member and bought outright by
              // another (a raw material to one plan, an intermediate to
              // another) — `builtQuantity` is only ever a portion of the
              // merged `quantity` then, never the whole of it, so `buyToShow`
              // is what's left to source once the built portion is set aside,
              // and the row still reads as a genuine (smaller) buy need
              // instead of being wrongly cleared to "Built" or left
              // overstated by the units another member is manufacturing.
              const builtQuantity = builtQuantityByType.get(material.typeID) ?? 0;
              const fullyBuilt = builtQuantity > 0 && builtQuantity >= material.quantity;
              const buyToShow = Math.max(0, material.remainingQuantity - builtQuantity);
              return (
                <li key={material.typeID} className="flex justify-between gap-2 px-2.5 py-1.5">
                  <span className="truncate">{nameForType(catalog, material.typeID)}</span>
                  <span className="shrink-0 tabular-nums text-text-dim">
                    {fullyBuilt
                      ? t('industry.priceSourceBuilt')
                      : t('industry.groupMaterialNeed', {
                          quantity: material.quantity.toLocaleString(),
                          remaining: buyToShow.toLocaleString(),
                        })}
                    {material.unpriced ? ` · ${t('industry.unpriced')}` : ''}
                  </span>
                </li>
              );
            })}
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
