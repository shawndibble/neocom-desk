import { useMemo, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  IconButton,
  LiveStatus,
  Panel,
  Spinner,
  Toast,
  Tooltip,
} from '@/components/ui';
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

const GROUP_COPY = 'group';

type CopyStatus = 'copied' | 'failed';

interface BuildGroupPanelProps {
  group: BuildGroup;
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  modifiers: CharacterModifiers;
  pricingInputs: BuildPlanPricingInputs;
  ownedStockSnapshot: OwnedStockSnapshot;
  onOpenPlan: (planId: string) => void;
  onRetarget: (target: RetargetTarget, planIds: string[]) => void;
  onAutoBuild: (options: { strategy: BuildStrategy; depth: number }) => Promise<number | void>;
  onOwnedStockChange: (ownedStock: Record<number, number>) => void;
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
  const { copied: copyState, flash: flashCopy } = useCopyFeedback<{
    key: string;
    status: CopyStatus;
  }>(2000);
  const [retargeting, setRetargeting] = useState(false);
  const [applyingAutoBuild, setApplyingAutoBuild] = useState(false);
  const [autoBuildToast, setAutoBuildToast] = useState<string | null>(null);
  const rows = useComparedBuildResults({
    plans,
    catalog,
    pi,
    ownedBlueprints,
    modifiers,
    pricingInputs,
    computeGroupResult: true,
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

  const incompleteHubs = useMemo(() => {
    const settled = new Set(members.map((member) => member.planId));
    const hubs = new Set<string>();
    for (const plan of plans) if (!settled.has(plan.id)) hubs.add(plan.hubId);
    return hubs;
  }, [members, plans]);

  const canCopy =
    rollup.singleHub && incompleteHubs.size === 0 && hasShoppingList(rollup.shoppingMaterials);

  async function handleCopy(key: string, materials: readonly MaterialCostLine[]) {
    try {
      await writeToClipboard(shoppingListText(materials, (id) => nameForType(catalog, id)));
      flashCopy({ key, status: 'copied' });
    } catch {
      flashCopy({ key, status: 'failed' });
    }
  }

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
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
              tone={copyStatusFor(GROUP_COPY) === 'failed' ? 'danger' : 'default'}
              label={
                copyStatusFor(GROUP_COPY) === 'copied'
                  ? t('industry.copyShoppingListDone')
                  : copyStatusFor(GROUP_COPY) === 'failed'
                    ? t('industry.copyShoppingListFailed')
                    : t('industry.copyShoppingList')
              }
              onClick={() => void handleCopy(GROUP_COPY, rollup.shoppingMaterials)}
              aria-disabled={!canCopy || undefined}
              tooltip={!canCopy ? t('industry.copyShoppingListNothing') : undefined}
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
          void onAutoBuild({ ...options, depth: autoBuild.maxDepth })
            .then((changed) => {
              if (changed === undefined) return;
              setAutoBuildToast(
                changed === 0
                  ? t('industry.autoBuildGroupNothing')
                  : t('industry.autoBuildGroupApplied', { count: changed })
              );
            })
            .finally(() => setApplyingAutoBuild(false));
        }}
      />

      {autoBuildToast && <Toast message={autoBuildToast} onClose={() => setAutoBuildToast(null)} />}

      {copyState?.status === 'failed' && (
        <InlineError>{t('industry.copyShoppingListFailed')}</InlineError>
      )}

      {!rollup.singleHub && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-warning">
            {t('industry.groupMixedHubs', {
              hubs: rollup.hubIds.map(hubLabel).join(', '),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            {rollup.shoppingByHub.map((block) => (
              <Tooltip
                key={block.hubId}
                content={
                  incompleteHubs.has(block.hubId)
                    ? t('industry.copyHubShoppingListIncomplete')
                    : !hasShoppingList(block.materials)
                      ? t('industry.copyHubShoppingListNothing')
                      : null
                }
              >
                <Button
                  size="sm"
                  onClick={() => void handleCopy(block.hubId, block.materials)}
                  aria-disabled={
                    incompleteHubs.has(block.hubId) ||
                    !hasShoppingList(block.materials) ||
                    undefined
                  }
                >
                  {copyStatusFor(block.hubId) === 'copied'
                    ? t('industry.copyHubShoppingListDone', { hub: hubLabel(block.hubId) })
                    : t('industry.copyHubShoppingList', { hub: hubLabel(block.hubId) })}
                </Button>
              </Tooltip>
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
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
          members={members}
          onOpenPlan={onOpenPlan}
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
