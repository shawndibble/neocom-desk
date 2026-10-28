/**
 * Materials and the Group Owned Overlay (issue #697) as one table: typing an
 * owned quantity updates that same row's Still To Buy instead of a separate
 * panel scroll-lengths away.
 */
import { formatCount } from '@/lib/formatCount';
import { useCallback, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { Button, DataTable, EmptyState, Panel } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { BuildPlanRecord } from '@/db';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import { rowVolume } from '@/engine/industry/materialVolume';
import type { OwnedStockScope } from '@/engine/industry/ownedStock';
import { ownedStockOffer } from '@/engine/industry/ownedStockOffer';
import { unmaskCount } from '@/lib/numberMask';
import type { PiData } from '@/sde/types';
import { nameForType, volumeForType, type BlueprintCatalog } from './blueprintCatalog';
import { buildItemMenuProps } from './buildItemMenuProps';
import type { BuildGroup } from './buildGroups';
import { DepthPriceLine } from './DepthPriceLine';
import { formatVolume } from './format';
import { groupMaterialsCsvColumns } from './groupMaterialsCsv';
import type { GroupRollupView } from './groupRollupView';
import { OwnedStockHint } from './OwnedStockHint';
import { OwnedStockScopeControl } from './OwnedStockScopeControl';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import {
  applyToGroupOwnedStock,
  groupMaterialTypeIdKey,
  ownedStockView,
  typeIdsFromKey,
} from './planMaterialsView';
import { SourcingInput } from './SourcingInput';
import type { BuyMaterialRow } from './useGroupBuyRows';
import { useDetectedOwnedStock } from './useDetectedOwnedStock';
import { useOwnedStockBulk } from './useOwnedStockBulk';

interface GroupMaterialsPanelProps {
  group: BuildGroup;
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  pi: PiData | null;
  ownedStockSnapshot: OwnedStockSnapshot;
  rollup: GroupRollupView['rollup'];
  buyRows: readonly BuyMaterialRow[];
  /** True when no material is left to buy *and* none is crafted. */
  nothingToBuy: boolean;
  depthByType: ReadonlyMap<number, DepthPrice>;
  /**
   * Group Owned Overlay (issue #697): writes the group's own owned-stock
   * ledger, replacing it wholesale — the same "replace, don't merge"
   * contract `withGroupOwnedStock` keeps.
   */
  onOwnedStockChange: (ownedStock: Record<number, number>) => void;
  onOwnedStockScopeChange: (scope: OwnedStockScope | undefined) => void;
}

export function GroupMaterialsPanel({
  group,
  plans,
  catalog,
  pi,
  ownedStockSnapshot,
  rollup,
  buyRows,
  nothingToBuy,
  depthByType,
  onOwnedStockChange,
  onOwnedStockScopeChange,
}: GroupMaterialsPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Stable: `DataTable` memoizes its rows on `rowContextMenu`.
  const rowContextMenu = useMemo(() => {
    const { itemMenuFor } = buildItemMenuProps(catalog, (typeId) =>
      navigate(bpcSourcingHref(typeId))
    );
    return (material: BuyMaterialRow, tr: ReactElement) => itemMenuFor(material.typeID, tr);
  }, [catalog, navigate]);

  // Every type any member's whole tree can show, not only each blueprint's
  // own materials: the buy table lists sub-build leaves
  // (`rollup.tableMaterials`), and a mineral only a component's recipe
  // introduces is as ownable here as on that member's own page — the same
  // Tritanium bug `BuildPlanDetail.tsx` fixed for one plan. Keyed on the
  // blueprints in play: `plans` gets a fresh identity on every keystroke in
  // any member, and an asset list runs to tens of thousands of rows per
  // Character.
  const blueprintSignature = plans.map((p) => `${p.blueprintTypeID}`).join(',');
  const materialTypeIdsKey = useMemo(
    () => groupMaterialTypeIdKey(plans, { catalog, pi }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blueprintSignature is the stable proxy for `plans`' structural identity; see comment above.
    [blueprintSignature, catalog, pi]
  );
  const materialTypeIds = useMemo(() => typeIdsFromKey(materialTypeIdsKey), [materialTypeIdsKey]);

  // The very detection a single plan's own page runs, over the union of the
  // group's materials — reused rather than re-derived, so a group and its
  // members can never hold two opinions about what the hangar contains. Feeds
  // the Group Owned Overlay's own ledger UI (issue #697), not the rollup
  // directly — `rollUpBuildGroup` only ever sees the ledger the pilot has
  // committed to, in `ownedStockMap`.
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
        stickyStart: true,
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
        render: (material) => formatCount(material.quantity),
      },
      {
        id: 'volume',
        header: t('industry.volume'),
        phoneHidden: true,
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
                parse={unmaskCount}
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
                : formatCount(material.buyToShow)}
            </span>
            {material.unpriced && material.buyToShow > 0 && (
              <span className="text-[0.6875rem] text-warning">{t('industry.unpriced')}</span>
            )}
            {material.buyToShow > 0 && depthByType.get(material.typeID) && (
              <DepthPriceLine depth={depthByType.get(material.typeID)!} />
            )}
          </span>
        ),
      },
    ],
    [t, catalog, ownedStockMap, detection, setOwnedQuantity, depthByType]
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

  return (
    <>
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
                    // The buy table's rows: a fully-crafted row is never bought,
                    // so it has no Have and no offer.
                    onClick={() => ownedBulk.fillAll(buyRows)}
                  >
                    {t('industry.useAllOwned')}
                  </Button>
                  <Button
                    size="sm"
                    // Every merged material: a ledger entry from before its
                    // material became fully crafted is still read by the rollup
                    // though the Crafted section shows no input for it, so "Use
                    // none" must reach it.
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
          {nothingToBuy ? (
            <EmptyState title={t('industry.groupNothingToBuy')} className="py-6" />
          ) : buyRows.length > 0 ? (
            <div className="overflow-x-auto">
              <DataTable
                {...buyMaterialsExport.tableProps}
                rowContextMenu={rowContextMenu}
                rowMoreActions
                columns={buyMaterialColumns}
                rows={buyRows}
                rowKey={(material) => material.typeID}
                label={t('industry.groupMaterials')}
                density="compact"
                // Figures read across columns: a table that scrolls sideways on a
                // phone (name pinned, volume and owned dropped), not cards.
                responsive="table"
              />
            </div>
          ) : null}
        </Panel>
        <p className="text-xs text-text-dim">{t('industry.groupEstimateNote')}</p>
      </div>
      {ownedBulk.toast}
    </>
  );
}
