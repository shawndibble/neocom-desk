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
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  IconButton,
  IskAmount,
  Panel,
  Spinner,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { Link } from 'react-router-dom';
import { onPlanLinkClick, planHref } from './planLinkClick';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import { rowVolume, totalVolume } from '@/engine/industry/materialVolume';
import type { OwnedStockScope } from '@/engine/industry/ownedStock';
import { ownedStockOffer } from '@/engine/industry/ownedStockOffer';
import type { MaterialCostLine } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { iskToneClass } from '@/features/character/format';
import { writeToClipboard } from '@/lib/clipboard';
import { cx } from '@/lib/cx';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';
import { getTradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';
import { nameForType, volumeForType, type BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroup } from './buildGroups';
import type { BuildPlanPricingInputs } from './buildPlanPricingInputs';
import { AutoBuildControl } from './AutoBuildControl';
import { groupCraftScope, groupAutoBuildMaxDepth } from './autoBuildGroup';
import { formatPercent, formatVolume } from './format';
import { computeGroupRollup } from './groupRollupView';
import { SourcingInput } from './MaterialsTable';
import { OwnedStockHint } from './OwnedStockHint';
import { OwnedStockScopeControl } from './OwnedStockScopeControl';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import {
  applyToGroupOwnedStock,
  groupMaterialTypeIdKey,
  ownedStockView,
  typeIdsFromKey,
} from './planMaterialsView';
import { useOwnedStockBulk } from './useOwnedStockBulk';
import { GroupSlotLine } from './PlanSlotLine';
import { countJobsByCategory } from './planJobSlots';
import { hasShoppingList, shoppingListText } from './shoppingList';
import { useComparedBuildResults } from './useComparedBuildResults';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';
import { RetargetGroupDialog, type RetargetTarget } from './RetargetGroupDialog';
import { groupMaterialsCsvColumns } from './groupMaterialsCsv';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';

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
  modifiers: CharacterModifiers;
  /** `useIndustryWorkspace`'s pricing inputs — see `useComparedBuildResults`. */
  pricingInputs: BuildPlanPricingInputs;
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
  modifiers,
  pricingInputs,
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
    modifiers,
    pricingInputs,
    computeGroupResult: true,
  });

  // The same inputs `useComparedBuildResults` prices these members against —
  // sub-builds unowned anywhere in the group must assume the same ME that
  // hook already quotes them at.
  const { assumedMe, corpBlueprints } = pricingInputs;

  // Depth is structural — which typeIDs have a recipe — and never
  // moves with a member's runs/ME/hub/sourcing edit, so this keys on the
  // blueprints actually in play rather than on `plans` itself: `plans` gets
  // a fresh array identity from `useLiveQuery` on every keystroke in any
  // member, and `groupAutoBuildMaxDepth` walks every member's full tree —
  // exactly the O(members) tree-walk cost `resultFlattenCache` exists to
  // avoid for the rollup's own flattening.
  const autoBuildBlueprintSignature = plans.map((p) => `${p.blueprintTypeID}`).join(',');
  const autoBuildMaxDepth = useMemo(
    () =>
      groupAutoBuildMaxDepth(
        plans,
        { catalog, pi, ownedBlueprints, corpOwnedBlueprints: corpBlueprints, assumedMe },
        modifiers
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autoBuildBlueprintSignature is the stable proxy for `plans`' structural identity; see comment above.
    [
      autoBuildBlueprintSignature,
      catalog,
      pi,
      ownedBlueprints,
      corpBlueprints,
      assumedMe,
      modifiers,
    ]
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

  const rowByPlanId = useMemo(() => new Map(rows.map((r) => [r.planId, r])), [rows]);
  const view = useMemo(
    () => computeGroupRollup(group, plans, rowByPlanId),
    [group, plans, rowByPlanId]
  );
  const { members, builtQuantityByType, rollup } = view;

  // Every type any member's whole tree can show, not only each blueprint's
  // own materials: the buy table below lists sub-build leaves
  // (`rollup.tableMaterials`), and a mineral only a component's recipe
  // introduces is as ownable here as on that member's own page — the same
  // Tritanium bug `BuildPlanDetail.tsx` fixed for one plan. Keyed on the
  // blueprints in play, like `autoBuildMaxDepth` above: `plans` gets a fresh
  // identity on every keystroke in any member, and an asset list runs to
  // tens of thousands of rows per Character.
  const materialTypeIdsKey = useMemo(
    () => groupMaterialTypeIdKey(plans, { catalog, pi }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autoBuildBlueprintSignature is the stable proxy for `plans`' structural identity; see autoBuildMaxDepth.
    [autoBuildBlueprintSignature, catalog, pi]
  );
  const materialTypeIds = useMemo(() => typeIdsFromKey(materialTypeIdsKey), [materialTypeIdsKey]);

  // The very detection a single plan's own page runs, over the union of the
  // group's materials — reused rather than re-derived, so a group and its
  // members can never hold two opinions about what the hangar contains. Feeds
  // the Group Owned Overlay's own ledger UI below (issue #697), not the
  // rollup directly — `rollUpBuildGroup` only ever sees the ledger the pilot
  // has committed to, in `ownedStockMap`.
  const detected = useDetectedOwnedStock(ownedStockSnapshot, materialTypeIds);
  // Corp Assets (issue #798) is a per-plan toggle, not a group-level one —
  // the group rollup never merges a corp source in, so no corp name or corp
  // incompleteness is passed.
  const { detection } = useMemo(
    () => ownedStockView({ ...detected, scope: group.ownedStockScope }, t),
    [detected, group.ownedStockScope, t]
  );

  const ownedStockMap = useMemo(
    () =>
      new Map(Object.entries(group.ownedStock ?? {}).map(([typeID, qty]) => [Number(typeID), qty])),
    [group.ownedStock]
  );

  // The group's own Acquisition Verdict, from the same `computeGroupRollup`
  // the index row reads, unknown while any member is still loading or failed.
  const groupProfit = view.savings;
  const groupVerdict = view.verdict;
  // Which way the numbers point, independent of whether they can be trusted:
  // an unknown verdict (a material has no price) still carries a signed
  // saving, and wording it as "BUY is cheaper by -X" was the bug. Headline and
  // sub-line both read this, so they can't disagree at exactly zero.
  const buildIsCheaper = groupProfit !== null && (groupVerdict === 'build' || groupProfit > 0);

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

  // Same rows the buy table itself shows a volume for (issue #874) — a
  // fully crafted material is excluded here for the same reason it never
  // reaches `buyRows`: it is produced inside the group, never hauled.
  const groupVolume = useMemo(
    () => totalVolume(buyRows, (typeID) => volumeForType(catalog, typeID)),
    [buyRows, catalog]
  );

  // Slot demand of the whole group: every member's own job plus each sub-job
  // beneath it, by pool — what `GroupSlotLine` sets against free slots.
  const groupJobCounts = useMemo(() => {
    const counts = { manufacturing: 0, science: 0, reaction: 0 };
    const byId = new Map(plans.map((p) => [p.id, p]));
    for (const member of members) {
      const plan = byId.get(member.planId);
      const activity = plan
        ? (catalog.byBlueprintTypeID.get(plan.blueprintTypeID)?.blueprint.activity ??
          'manufacturing')
        : 'manufacturing';
      const memberCounts = countJobsByCategory(activity, member.result.materials, catalog);
      counts.manufacturing += memberCounts.manufacturing;
      counts.science += memberCounts.science;
      counts.reaction += memberCounts.reaction;
    }
    return counts;
  }, [members, plans, catalog]);

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
    const volume = t(
      groupVolume.anyUnknown ? 'industry.groupVerdictVolumeAtLeast' : 'industry.groupVerdictVolume',
      { volume: formatVolume(groupVolume.volume) }
    );
    if (groupProfit === null || rollup.buyCost === null) {
      return [material, jobFees, duration, volume].join(' · ');
    }
    const pct = buildIsCheaper
      ? rollup.buyCost > 0
        ? (groupProfit / rollup.buyCost) * 100
        : null
      : rollup.totalCost > 0
        ? (-groupProfit / rollup.totalCost) * 100
        : null;
    // A mixed-hub group has no one "buying at X" to name (see the mixed-hub
    // notice further down) — the percent still stands on its own without it.
    const hub = rollup.singleHub ? hubLabel(rollup.hubIds[0]) : null;
    const comparisonKey = buildIsCheaper
      ? hub
        ? 'industry.groupVerdictCheaperAt'
        : 'industry.groupVerdictCheaper'
      : hub
        ? 'industry.groupVerdictMoreAt'
        : 'industry.groupVerdictMore';
    const comparison = pct === null ? null : t(comparisonKey, { percent: formatPercent(pct), hub });
    return [comparison, material, jobFees, duration, volume].filter(Boolean).join(' · ');
  }, [
    groupProfit,
    buildIsCheaper,
    groupVolume,
    rollup.buyCost,
    rollup.totalCost,
    rollup.materialCost,
    rollup.topLevelJobFees,
    rollup.seconds,
    rollup.singleHub,
    rollup.hubIds,
    t,
  ]);

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
      updateOwnedStock((next) => applyToGroupOwnedStock(next, [{ typeID, to: quantity }]));
    },
    [updateOwnedStock]
  );

  // "Use all" / "Use none", written through the Group Owned Overlay adapter.
  const ownedBulk = useOwnedStockBulk({
    write: (changes) => updateOwnedStock((next) => applyToGroupOwnedStock(next, changes)),
    ownedFor: (typeID) => ownedStockMap.get(typeID),
    scopedQuantityFor: detection.scopedQuantityFor,
  });

  const buyMaterialColumns = useMemo<DataTableColumn<BuyMaterialRow>[]>(
    () => [
      {
        id: 'material',
        header: t('industry.material'),
        primary: true,
        sortValue: (material) => nameForType(catalog, material.typeID),
        render: (material) => (
          <span className="truncate">{nameForType(catalog, material.typeID)}</span>
        ),
      },
      {
        id: 'need',
        header: t('industry.quantity'),
        align: 'right',
        className: 'tabular-nums text-text-dim',
        sortValue: (material) => material.quantity,
        render: (material) => material.quantity.toLocaleString(),
      },
      {
        id: 'volume',
        header: t('industry.volume'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (material) =>
          rowVolume(material, (typeID) => volumeForType(catalog, typeID)) ?? undefined,
        render: (material) => {
          const volume = rowVolume(material, (typeID) => volumeForType(catalog, typeID));
          return <span>{volume === null ? t('common.unknown') : formatVolume(volume)}</span>;
        },
      },
      {
        id: 'owned',
        header: t('industry.ownedQuantity'),
        align: 'right',
        render: (material) => {
          const owned = ownedStockMap.get(material.typeID);
          const scopedQuantity = detection.scopedQuantityFor(material.typeID);
          const offer = ownedStockOffer(material, scopedQuantity, owned);
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
              {offer !== null && (
                <OwnedStockHint
                  scopedQuantity={scopedQuantity}
                  detection={detection}
                  materialName={nameForType(catalog, material.typeID)}
                  suggestion={offer}
                  onApply={() => setOwnedQuantity(material.typeID, offer)}
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
        headerClassName: 'whitespace-nowrap',
        className: 'tabular-nums',
        sortValue: (material) => material.buyToShow,
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

  const buyMaterialsCsv = useMemo(
    () =>
      groupMaterialsCsvColumns(
        t,
        (typeID) => nameForType(catalog, typeID),
        (typeID) => volumeForType(catalog, typeID),
        (typeID) => ownedStockMap.get(typeID)
      ),
    [t, catalog, ownedStockMap]
  );
  const buyMaterialsExport = useTableExport({
    surface: 'build-group-materials',
    rows: buyRows,
    columns: buyMaterialsCsv,
  });

  // The copy outcome is a flash, not a state the panel keeps. Cleared by an
  // effect rather than a `setTimeout` in the handler, so unmounting mid-flash
  // — or copying another hub before it fades — cancels the pending timer
  // instead of setting state on a gone component.
  useEffect(() => {
    if (copyState === null) return;
    const timer = setTimeout(() => setCopyState(null), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

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
          {/* `tabIndex={-1}`: route focus (`app/routeFocus.ts`) lands here after navigation. */}
          <h1
            tabIndex={-1}
            className="truncate text-sm font-semibold tracking-widest text-text uppercase focus:outline-none"
          >
            {group.name}
          </h1>
          <span className="shrink-0 text-xs text-text-dim">
            {t('industry.groupMemberCount', { count: plans.length })}
          </span>
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
              groupProfit === null
                ? 'text-text-dim'
                : groupVerdict === 'unknown'
                  ? 'text-warning'
                  : iskToneClass(groupProfit)
            )}
          >
            <span className="sr-only">{t('industry.acquisitionVerdictLabel')} </span>
            {groupProfit === null ? (
              <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
            ) : groupVerdict === 'build' ? (
              <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
            ) : (
              <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
            )}
            {groupProfit === null
              ? t('industry.verdictUnknown')
              : groupVerdict === 'build'
                ? t('industry.verdictBuild', { amount: formatIsk(groupProfit) })
                : buildIsCheaper
                  ? t('industry.verdictBuildCheaper', { amount: formatIsk(groupProfit) })
                  : t('industry.verdictBuy', { amount: formatIsk(-groupProfit) })}
          </p>
          <p className="text-xs tabular-nums text-text-dim">{verdictQualifiers}</p>
          {plans.length > 0 && (
            <div className="basis-full">
              <GroupSlotLine characterId={plans[0].characterId} counts={groupJobCounts} />
            </div>
          )}
        </div>
      )}

      <AutoBuildControl
        trailing={
          <>
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
          </>
        }
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
                    <Link
                      to={planHref(plan.id)}
                      onClick={onPlanLinkClick(() => onOpenPlan(plan.id))}
                      className={`${tappableRowClassName} group flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left ${rowInteractiveClassName} ${focusRingInsetClassName}`}
                    >
                      <span className="truncate text-accent">{plan.name}</span>
                      <span className="shrink-0 tabular-nums text-text-dim">
                        {row?.result ? (
                          <IskAmount value={row.result.totalCost} decimals={0} />
                        ) : (
                          '—'
                        )}
                      </span>
                      <Icon.Descend
                        size={Icon.ICON_SIZE.sm}
                        aria-hidden="true"
                        className="-mr-1 shrink-0 text-text-faint group-hover:text-accent"
                      />
                    </Link>
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
                    <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
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
        <div className="space-y-2">
          <Panel
            title={t('industry.groupMaterials')}
            padded={false}
            actions={
              buyRows.length > 0 ? (
                <TableActionsMenu
                  name={t('industry.groupMaterials')}
                  tableExport={buyMaterialsExport}
                />
              ) : undefined
            }
          >
            <div className="space-y-3 p-2.5">
              <OwnedStockScopeControl
                scope={group.ownedStockScope}
                detectedStock={detected.stock}
                detection={detection}
                onChange={onOwnedStockScopeChange}
                action={
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      // The buy table's rows: a fully-crafted row (see above) is
                      // never bought, so it has no Have and no offer.
                      onClick={() => ownedBulk.fillAll(buyRows)}
                    >
                      {t('industry.useAllOwned')}
                    </Button>
                    <Button
                      size="sm"
                      // Every merged material: a ledger entry from before its
                      // material became fully crafted (see `craftedTypeIds`) is
                      // still read by the rollup though the Crafted section
                      // shows no input for it, so "Use none" must reach it.
                      onClick={() => ownedBulk.clearAll(rollup.tableMaterials)}
                    >
                      {t('industry.useNoneOwned')}
                    </Button>
                  </div>
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
                  {...buyMaterialsExport.tableProps}
                  columns={buyMaterialColumns}
                  rows={buyRows}
                  rowKey={(material) => material.typeID}
                  label={t('industry.groupMaterials')}
                  density="compact"
                  // Five figures broke to a 5-line stack at 390px; pair two per line,
                  // same fix as MaterialsTable's single-plan buy table.
                  stackColumns={2}
                  mobileSort
                />
              </div>
            ) : null}
          </Panel>
          <p className="text-xs text-text-dim">{t('industry.groupEstimateNote')}</p>
        </div>
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
      {ownedBulk.toast}
    </div>
  );
}
