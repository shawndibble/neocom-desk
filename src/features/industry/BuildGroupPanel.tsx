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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataTable, EmptyState, IconButton, Panel, Spinner } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import { rollUpBuildGroup, type BuildGroupMember } from '@/engine/industry/groupRollup';
import {
  filterStockByScope,
  suggestedOwnedQuantity,
  type OwnedStockScope,
} from '@/engine/industry/ownedStock';
import type { MaterialCostLine, SkillLevels } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { iskToneClass } from '@/features/character/format';
import { writeToClipboard } from '@/lib/clipboard';
import { cx } from '@/lib/cx';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';
import { getTradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';
import { useAssumedMe } from './assumedMe';
import { nameForType, toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroup } from './buildGroups';
import { AutoBuildControl } from './AutoBuildControl';
import { groupCraftScope, groupAutoBuildMaxDepth } from './autoBuildGroup';
import { formatPercent } from './format';
import { profitOf, verdictOf } from './groupIndexStats';
import { SourcingInput } from './MaterialsTable';
import { OwnedStockHint } from './OwnedStockHint';
import { OwnedStockScopeControl } from './OwnedStockScopeControl';
import { stockLocationLabel, type OwnedStockSnapshot } from './ownedStockDetection';
import type { OwnedStockDetection } from './ownedStockDetection';
import { recipeForLookup } from './recipes';
import { flattenBuildResult } from './resultFlattenCache';
import { hasShoppingList, shoppingListText } from './shoppingList';
import { useComparedBuildResults } from './useComparedBuildResults';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';
import { RetargetGroupDialog, type RetargetTarget } from './RetargetGroupDialog';

/** A merged materials row still open to buying, plus the buy-list's own
 * netted remainder — see the `buyRows`/`craftedTypeIds` split below. */
type BuyMaterialRow = MaterialCostLine & { buyToShow: number };

/** Whole-unit input parsing shared by every owned-quantity cell in this panel. */
function parseOwnedCount(raw: string): number | undefined {
  const value = unmaskNumber(raw);
  return value === undefined ? undefined : Math.floor(value);
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
   * Auto Build on the group (issue #696): applies one Build Strategy to
   * every member independently, always across each member's own whole tree
   * (issue #798 dropped the depth choice). Returns a Promise so this
   * panel can disable the control for the duration, the same way a
   * synchronous single-plan Apply never needs to.
   */
  onAutoBuild: (options: { strategy: BuildStrategy; depth: number }) => Promise<void>;
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
  onAutoBuild,
  onOwnedStockChange,
  onOwnedStockScopeChange,
}: BuildGroupPanelProps) {
  const { t } = useTranslation();
  // Which list the outcome belongs to, not a bare flag: a mixed-hub group
  // shows one copy control per hub, and a shared flag would report Amarr as
  // copied the moment Jita was. `GROUP_COPY` is the whole-group control's key.
  const [copyState, setCopyState] = useState<{ key: string; status: CopyStatus } | null>(null);
  const [retargeting, setRetargeting] = useState(false);
  const [applyingAutoBuild, setApplyingAutoBuild] = useState(false);
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

  // Depth is structural — which typeIDs have a recipe — and never
  // moves with a member's runs/ME/hub/sourcing edit, so this keys on the
  // blueprints actually in play rather than on `plans` itself: `plans` gets
  // a fresh array identity from `useLiveQuery` on every keystroke in any
  // member, and `groupAutoBuildMaxDepth` walks every member's full tree —
  // exactly the O(members) tree-walk cost `resultFlattenCache` exists to
  // avoid for the rollup's own flattening.
  const autoBuildBlueprintSignature = plans.map((p) => `${p.blueprintTypeID}`).join(',');
  const autoBuildMaxDepth = useMemo(
    () => groupAutoBuildMaxDepth(plans, catalog, recipeFor, skills),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autoBuildBlueprintSignature is the stable proxy for `plans`' structural identity; see comment above.
    [autoBuildBlueprintSignature, catalog, recipeFor, skills]
  );
  // Craft Scope's Reactions chip (issue #698): lit whenever any single member
  // is eligible, keyed on each member's own flag too, unlike the signature
  // above — depth is structural, but eligibility follows Include Reactions.
  const autoBuildScopeSignature = plans
    .map((p) => `${p.blueprintTypeID}:${p.includeReactions ?? false}`)
    .join(',');
  const autoBuildScope = useMemo(
    () => groupCraftScope(plans, catalog),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autoBuildScopeSignature is the stable proxy for `plans`' structural identity; see comment above.
    [autoBuildScopeSignature, catalog]
  );
  // What Apply will actually touch: `applyGroupAutoBuild` silently skips a
  // member whose blueprint no longer resolves in the catalog (the same
  // "skip, don't zero" policy the rollup itself applies to an unresolvable
  // member), so the confirmation must count survivors, not every plan in the
  // group, or it would overstate its own blast radius.
  const autoBuildAffectedCount = plans.filter((p) =>
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
      // Corp Assets (issue #798) is a per-plan toggle, not a group-level one —
      // the group rollup never merges a corp source in, so this is never
      // actually reached, only required by the shared `OwnedStockDetection` shape.
      corporationNameFor: () => t('common.unknown'),
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

  // The group's own Acquisition Verdict — buyCost null means at least one
  // member is unpriced, same "unknown" rule `computeGroupIndexStats` already
  // applies to the index row for this group.
  const groupProfit = profitOf(rollup.totalCost, rollup.buyCost);
  const groupVerdict = verdictOf(groupProfit);

  // The verdict band's sub-line: percent + hub only when there's a real
  // comparison to state (buyCost known and non-zero on the relevant side);
  // material cost, job fees, and job time are always known once pricing
  // settles, so those three always show.
  const verdictQualifiers = useMemo(() => {
    const material = t('industry.groupVerdictMaterial', { amount: formatIsk(rollup.materialCost) });
    const jobFees = t('industry.groupVerdictJobFees', {
      amount: formatIsk(rollup.topLevelJobFees),
    });
    const duration = formatDuration(rollup.seconds);
    if (groupProfit === null || rollup.buyCost === null) {
      return [material, jobFees, duration].join(' · ');
    }
    const pct =
      groupVerdict === 'build'
        ? rollup.buyCost > 0
          ? (groupProfit / rollup.buyCost) * 100
          : null
        : rollup.totalCost > 0
          ? (-groupProfit / rollup.totalCost) * 100
          : null;
    // A mixed-hub group has no one "buying at X" to name (see the mixed-hub
    // notice further down) — the percent still stands on its own without it.
    const hub = rollup.singleHub ? hubLabel(rollup.hubIds[0]) : null;
    const comparisonKey =
      groupVerdict === 'build'
        ? hub
          ? 'industry.groupVerdictCheaperAt'
          : 'industry.groupVerdictCheaper'
        : hub
          ? 'industry.groupVerdictMoreAt'
          : 'industry.groupVerdictMore';
    const comparison = pct === null ? null : t(comparisonKey, { percent: formatPercent(pct), hub });
    return [comparison, material, jobFees, duration].filter(Boolean).join(' · ');
  }, [
    groupProfit,
    groupVerdict,
    rollup.buyCost,
    rollup.totalCost,
    rollup.materialCost,
    rollup.topLevelJobFees,
    rollup.seconds,
    rollup.singleHub,
    rollup.hubIds,
    t,
  ]);

  // Materials merge Need/Owned/Still-to-buy into one table now (issue: group
  // page redesign) — but a material fully covered by this group's own build
  // tree (`builtQuantityByType` above) was never bought at all, so it moves to
  // its own "Crafted" list below rather than sitting in the buy table showing
  // "Covered" for a reason that has nothing to do with the owned-stock ledger.
  const { buyRows, craftedTypeIds } = useMemo(() => {
    const buyRows: BuyMaterialRow[] = [];
    const craftedTypeIds: number[] = [];
    for (const line of rollup.tableMaterials) {
      const builtQuantity = builtQuantityByType.get(line.typeID) ?? 0;
      if (builtQuantity > 0 && builtQuantity >= line.quantity) {
        craftedTypeIds.push(line.typeID);
        continue;
      }
      buyRows.push({ ...line, buyToShow: Math.max(0, line.remainingQuantity - builtQuantity) });
    }
    return { buyRows, craftedTypeIds };
  }, [rollup.tableMaterials, builtQuantityByType]);

  /** One write path for the ledger: every caller mutates a copy of `group.ownedStock`, this commits it. */
  const updateOwnedStock = useCallback(
    (mutate: (next: Record<number, number>) => void) => {
      const next: Record<number, number> = { ...group.ownedStock };
      mutate(next);
      onOwnedStockChange(next);
    },
    [group.ownedStock, onOwnedStockChange]
  );

  const setOwnedQuantity = useCallback(
    (typeID: number, quantity: number | undefined) => {
      updateOwnedStock((next) => {
        if (quantity === undefined || quantity <= 0) delete next[typeID];
        else next[typeID] = quantity;
      });
    },
    [updateOwnedStock]
  );

  // Same "never clobber a hand-typed value" rule the plan-level bulk fill
  // keeps: only rows with nothing in the ledger yet are offered. Scoped to
  // `buyRows`, not every merged material — a fully-crafted row (see above)
  // is never bought, so it has no owned quantity for "Use all"/"Use none" to
  // touch.
  const bulkDetectedEntries = useMemo(
    () =>
      buyRows
        .filter((m) => ownedStockMap.get(m.typeID) === undefined && scopedStock.has(m.typeID))
        .map(
          (m) =>
            [
              m.typeID,
              suggestedOwnedQuantity(scopedStock.get(m.typeID)!.quantity, m.quantity),
            ] as const
        ),
    [buyRows, ownedStockMap, scopedStock]
  );
  // Unlike `bulkDetectedEntries`, this scans every merged material, not just
  // `buyRows`: a material can carry an owned-stock ledger entry from before
  // it became fully crafted (see `craftedTypeIds` above), and that entry is
  // still live in `ownedStockMap` — still read by `rollUpBuildGroup` above —
  // even though the Crafted section renders no input for it. "Use none" has
  // to be able to reach it, or a stray entry becomes permanently stuck.
  const bulkClearTypeIds = useMemo(
    () =>
      rollup.tableMaterials
        .filter((m) => (ownedStockMap.get(m.typeID) ?? 0) > 0)
        .map((m) => m.typeID),
    [rollup.tableMaterials, ownedStockMap]
  );

  const buyMaterialColumns = useMemo<DataTableColumn<BuyMaterialRow>[]>(
    () => [
      {
        id: 'material',
        header: t('industry.material'),
        primary: true,
        render: (material) => (
          <span className="truncate">{nameForType(catalog, material.typeID)}</span>
        ),
      },
      {
        id: 'need',
        header: t('industry.quantity'),
        align: 'right',
        className: 'tabular-nums text-text-dim',
        render: (material) => material.quantity.toLocaleString(),
      },
      {
        id: 'owned',
        header: t('industry.ownedQuantity'),
        align: 'right',
        render: (material) => {
          const stock = detection.stockFor(material.typeID);
          const owned = ownedStockMap.get(material.typeID);
          const scopedQuantity = detection.scopedQuantityFor(material.typeID);
          const suggestion = stock ? suggestedOwnedQuantity(scopedQuantity, material.quantity) : 0;
          return (
            <span className="flex flex-col items-start gap-0.5 sm:items-end">
              <SourcingInput
                value={owned}
                label={t('industry.groupOwnedQuantityLabel', {
                  material: nameForType(catalog, material.typeID),
                })}
                inputMode="numeric"
                widthClassName="w-20"
                placeholder="0"
                parse={parseOwnedCount}
                onCommit={(quantity) => setOwnedQuantity(material.typeID, quantity)}
              />
              {stock && (
                <OwnedStockHint
                  scopedQuantity={scopedQuantity}
                  detection={detection}
                  materialName={nameForType(catalog, material.typeID)}
                  suggestion={suggestion}
                  canApply={owned !== suggestion && suggestion > 0}
                  onApply={() => setOwnedQuantity(material.typeID, suggestion)}
                />
              )}
            </span>
          );
        },
      },
      {
        id: 'stillToBuy',
        header: t('industry.stillToBuyColumn'),
        align: 'right',
        className: 'tabular-nums',
        render: (material) => (
          <span className="flex flex-col items-start gap-0.5 sm:items-end">
            <span className={material.buyToShow === 0 ? 'text-success' : 'font-semibold'}>
              {material.buyToShow === 0
                ? t('industry.stillToBuyCovered')
                : material.buyToShow.toLocaleString()}
            </span>
            {material.unpriced && material.buyToShow > 0 && (
              <span className="text-[0.6875rem] text-warning">{t('industry.unpriced')}</span>
            )}
          </span>
        ),
      },
    ],
    [t, catalog, ownedStockMap, detection, setOwnedQuantity]
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
      {/* A plain header, not a boxed Panel (group page redesign) — the group
          name is this page's own title, not a panel among panels, so it
          reads the way a page heading does rather than sitting in a frame. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold tracking-wide text-text uppercase">
            {group.name}
          </h1>
          <span className="shrink-0 text-xs text-text-dim">
            {t('industry.groupMemberCount', { count: plans.length })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            icon={<Icon.RetargetGroup />}
            label={t('industry.retargetGroupAction')}
            onClick={() => setRetargeting(true)}
          />
          <IconButton
            size="sm"
            icon={
              copyStatusFor(GROUP_COPY) === 'copied' ? (
                <Icon.Done />
              ) : copyStatusFor(GROUP_COPY) === 'failed' ? (
                <Icon.Warn />
              ) : (
                <Icon.CopyToClipboard />
              )
            }
            // Both outcomes change the glyph as well as the tone, so neither
            // is carried by colour alone (docs/DESIGN.md §7) — mirrors the
            // single-plan copy control (`BuildPlanDetail.tsx`).
            tone={copyStatusFor(GROUP_COPY) === 'failed' ? 'danger' : 'default'}
            label={
              copyStatusFor(GROUP_COPY) === 'copied'
                ? t('industry.copyShoppingListDone')
                : copyStatusFor(GROUP_COPY) === 'failed'
                  ? t('industry.copyShoppingListFailed')
                  : t('industry.copyShoppingList')
            }
            onClick={() => void handleCopy(GROUP_COPY, rollup.shoppingMaterials)}
            disabled={!canCopy}
          />
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Spinner label={t('common.loading')} />
        </div>
      )}

      {/* The group's own Acquisition Verdict, up front, as a single band —
          the headline profit figure and the numbers that qualify it on one
          line under it, mirroring `PlanVerdictHero`'s single-plan hero so a
          group and its members never disagree about what "Build"/"Buy"
          mean. */}
      {!loading && (
        <div
          className={cx(
            'flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xs border p-3',
            groupProfit === null
              ? 'border-line'
              : groupVerdict === 'build'
                ? 'border-accent-dim bg-accent/5'
                : 'border-warning/50 bg-warning/10'
          )}
        >
          <p
            className={cx(
              'inline-flex items-center gap-1.5 text-base font-semibold tabular-nums',
              groupProfit === null ? 'text-text-dim' : iskToneClass(groupProfit)
            )}
          >
            <span className="sr-only">{t('industry.acquisitionVerdictLabel')} </span>
            {groupProfit === null ? (
              <Icon.Info size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
            ) : groupVerdict === 'build' ? (
              <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
            ) : (
              <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
            )}
            {groupProfit === null
              ? t('industry.verdictUnknown')
              : groupVerdict === 'build'
                ? t('industry.verdictBuild', { amount: formatIsk(groupProfit) })
                : t('industry.verdictBuy', { amount: formatIsk(-groupProfit) })}
          </p>
          <p className="text-xs tabular-nums text-text-dim">{verdictQualifiers}</p>
        </div>
      )}

      <AutoBuildControl
        maxDepth={autoBuildMaxDepth}
        scope={autoBuildScope}
        disabled={applyingAutoBuild}
        initialStrategy={group.autoBuildDefault?.strategy}
        confirmMessage={t('industry.autoBuildConfirmGroup', {
          count: autoBuildAffectedCount,
        })}
        onApply={(options) => {
          setApplyingAutoBuild(true);
          void onAutoBuild({ ...options, depth: autoBuildMaxDepth }).finally(() =>
            setApplyingAutoBuild(false)
          );
        }}
      />

      <p className="text-xs text-text-dim">{t('industry.groupEstimateNote')}</p>

      {/* Shown as a line rather than as the button's own label: the message
          is about the clipboard, not about which list, and it is a sentence
          long — it would not fit on any of the controls that can raise it. */}
      {copyState?.status === 'failed' && (
        <p role="alert" className="text-xs text-danger">
          {t('industry.copyShoppingListFailed')}
        </p>
      )}

      {/* A mixture is a shopping trip with two stops, not a dead end (issue
          #631). The header control above stays disabled — there is no one
          list it could copy — and each hub gets its own paste here rather
          than in `actions`, where five buttons would not survive a phone. */}
      {!rollup.singleHub && (
        <div className="space-y-2">
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
        <p className="text-xs text-warning">{t('industry.groupUnpriceable')}</p>
      )}
      {failed.length > 0 && (
        <ul className="text-xs text-danger">
          {failed.map((row) => (
            <li key={row.planId}>{t('industry.compareUnresolvedFor', { plan: row.planName })}</li>
          ))}
        </ul>
      )}

      {/* Full-width now that the plan/group list has its own route (issue:
          group page redesign) — Members and Materials sit side by side
          rather than competing with a nav rail and a 20rem list column for
          the same row. */}
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
        <div className="space-y-4">
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

          {/* A material this group's own build tree fully produces (see
              `craftedTypeIds` above) was never bought at all, so it lives
              alongside Members rather than inside the buy table — the two
              panels together are "what this group is made of," split by
              whether a plan is another member or a material it manufactures
              directly. */}
          {craftedTypeIds.length > 0 && (
            <Panel
              title={t('industry.groupCraftedTitle', { count: craftedTypeIds.length })}
              padded={false}
            >
              <ul className="divide-y divide-line text-xs">
                {craftedTypeIds.map((typeID) => (
                  <li
                    key={typeID}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5"
                  >
                    <span className="truncate">{nameForType(catalog, typeID)}</span>
                    <span className="shrink-0 rounded-xs border border-accent-dim/50 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide text-accent uppercase">
                      {t('industry.groupCraftedTag')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="p-2.5 text-[0.6875rem] text-text-dim">
                {t('industry.groupCraftedHint')}
              </p>
            </Panel>
          )}
        </div>

        {/* Materials and the Group Owned Overlay (issue #697) as one table:
            typing an owned quantity updates that same row's Still To Buy
            instead of a separate panel scroll-lengths away. */}
        <Panel title={t('industry.groupMaterials')} padded={false}>
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
          </div>

          {/* An empty buy table two different ways: genuinely nothing left
              (every material owned, or there are none) reads "Nothing left
              to buy," but a table empty because everything is crafted has
              its own panel beside Members explaining that — showing both
              would call a crafted material "owned," which is exactly the
              hangar-vs-job confusion the Crafted panel exists to avoid. */}
          {buyRows.length === 0 && craftedTypeIds.length === 0 ? (
            <EmptyState title={t('industry.groupNothingToBuy')} className="py-6" />
          ) : buyRows.length > 0 ? (
            <div className="overflow-x-auto">
              <DataTable
                columns={buyMaterialColumns}
                rows={buyRows}
                rowKey={(material) => material.typeID}
                label={t('industry.groupMaterials')}
                density="compact"
              />
            </div>
          ) : null}
        </Panel>
      </div>

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
