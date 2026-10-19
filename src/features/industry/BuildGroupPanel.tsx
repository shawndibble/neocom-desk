/**
 * A **Build Group** opened as one thing: every member's materials merged and
 * its costs summed (issue #626, "Group Rollup" in GLOSSARY.md).
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
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, IconButton, LiveStatus, Panel, Spinner } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { OwnedStockScope } from '@/engine/industry/ownedStock';
import type { MaterialCostLine } from '@/engine/industry/types';
import { hasShoppingList, shoppingListText } from '@/engine/industry/shoppingList';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { writeToClipboard } from '@/lib/clipboard';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import type { PiData } from '@/sde/types';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroup } from './buildGroups';
import type { BuildPlanPricingInputs } from './buildPlanPricingInputs';
import { AutoBuildControl } from './AutoBuildControl';
import { GroupCraftedPanel } from './GroupCraftedPanel';
import { GroupMaterialsPanel } from './GroupMaterialsPanel';
import { GroupMembersPanel } from './GroupMembersPanel';
import { GroupVerdictBand } from './GroupVerdictBand';
import { hubLabel } from './groupHubLabel';
import { computeGroupRollup } from './groupRollupView';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { RetargetGroupDialog, type RetargetTarget } from './RetargetGroupDialog';
import { useComparedBuildResults } from './useComparedBuildResults';
import { useGroupAutoBuild } from './useGroupAutoBuild';
import { useGroupBuyRows } from './useGroupBuyRows';

/** The whole-group copy control's key in `copyState`; no hub can collide with it. */
const GROUP_COPY = 'group';

type CopyStatus = 'copied' | 'failed';

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
  const { copied: copyState, flash: flashCopy } = useCopyFeedback<{
    key: string;
    status: CopyStatus;
  }>(2000);
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
    // Depth Prices walked on the group's summed need, never per member.
    groupDepthPrices: true,
  });
  const autoBuild = useGroupAutoBuild({
    plans,
    catalog,
    pi,
    ownedBlueprints,
    modifiers,
    pricingInputs,
  });

  const rowByPlanId = useMemo(() => new Map(rows.map((r) => [r.planId, r])), [rows]);
  const view = useMemo(
    () => computeGroupRollup(group, plans, rowByPlanId),
    [group, plans, rowByPlanId]
  );
  const { members, rollup } = view;
  const { buyRows, craftedTypeIds, groupVolume } = useGroupBuyRows(view, catalog);

  // First hub's walk wins for a type a mixed-hub group buys at both.
  const depthByType = useMemo(() => {
    const byType = new Map<number, DepthPrice>();
    for (const row of rows) {
      for (const [typeID, walk] of row.depth ?? [])
        if (!byType.has(typeID)) byType.set(typeID, walk);
    }
    return byType;
  }, [rows]);

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
      flashCopy({ key, status: 'copied' });
    } catch {
      flashCopy({ key, status: 'failed' });
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

      {loading && (
        <div className="flex justify-center py-4">
          <Spinner label={t('common.loading')} />
        </div>
      )}
      {!loading && (
        <GroupVerdictBand view={view} plans={plans} catalog={catalog} groupVolume={groupVolume} />
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
            <LiveStatus>
              {copyStatusFor(GROUP_COPY) === 'copied' ? t('industry.copyShoppingListDone') : null}
            </LiveStatus>
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
        maxDepth={autoBuild.maxDepth}
        scope={autoBuild.scope}
        disabled={applyingAutoBuild}
        initialStrategy={group.autoBuildDefault?.strategy}
        confirmMessage={t('industry.autoBuildConfirmGroup', {
          count: autoBuild.affectedCount,
        })}
        onApply={(options) => {
          setApplyingAutoBuild(true);
          void onAutoBuild({ ...options, depth: autoBuild.maxDepth }).finally(() =>
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {/* The plans sit above the table, not beside it: the buy table has six
            figure columns and "Still to buy" is the one that matters, so it
            gets the page's full width rather than what a 20rem list leaves. */}
        <div
          className={`grid grid-cols-[minmax(0,1fr)] items-start gap-4 ${craftedTypeIds.length > 0 ? 'md:grid-cols-2' : ''}`}
        >
          <GroupMembersPanel plans={plans} rowByPlanId={rowByPlanId} onOpenPlan={onOpenPlan} />
          {craftedTypeIds.length > 0 && (
            <GroupCraftedPanel craftedTypeIds={craftedTypeIds} catalog={catalog} />
          )}
        </div>

        <GroupMaterialsPanel
          group={group}
          plans={plans}
          catalog={catalog}
          pi={pi}
          ownedStockSnapshot={ownedStockSnapshot}
          rollup={rollup}
          buyRows={buyRows}
          nothingToBuy={buyRows.length === 0 && craftedTypeIds.length === 0}
          depthByType={depthByType}
          onOwnedStockChange={onOwnedStockChange}
          onOwnedStockScopeChange={onOwnedStockScopeChange}
        />
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
