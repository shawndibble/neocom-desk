import { formatCount } from '@/lib/formatCount';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { Button, DataTable, EmptyState, MenuItem, Panel } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { BuildPlanRecord } from '@/db';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import type { BuildGroupMember } from '@/engine/industry/groupRollup';
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
import { groupMaterialConsumers } from './groupMaterialConsumers';
import type { GroupRollupView } from './groupRollupView';
import { GroupUsedByModal } from './GroupUsedByModal';
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
  members: readonly BuildGroupMember[];
  onOpenPlan: (planId: string) => void;
  buyRows: readonly BuyMaterialRow[];
  nothingToBuy: boolean;
  depthByType: ReadonlyMap<number, DepthPrice>;
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
  members,
  onOpenPlan,
  buyRows,
  nothingToBuy,
  depthByType,
  onOwnedStockChange,
  onOwnedStockScopeChange,
}: GroupMaterialsPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [usedByTypeId, setUsedByTypeId] = useState<number | null>(null);
  const menuProps = useMemo(
    () => buildItemMenuProps(catalog, (typeId) => navigate(bpcSourcingHref(typeId))),
    [catalog, navigate]
  );
  const rowContextMenu = useMemo(
    () => (material: BuyMaterialRow, tr: ReactElement) =>
      menuProps.itemMenuFor(
        material.typeID,
        tr,
        groupMaterialConsumers(members, material.typeID).length >= 2 ? (
          <MenuItem onSelect={() => setUsedByTypeId(material.typeID)}>
            {t('industry.usedBy.menuItem')}
          </MenuItem>
        ) : undefined
      ),
    [menuProps, members, t]
  );

  const blueprintSignature = plans.map((p) => `${p.blueprintTypeID}`).join(',');
  const materialTypeIdsKey = useMemo(
    () => groupMaterialTypeIdKey(plans, { catalog, pi }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blueprintSignature is the stable proxy for `plans`' structural identity; see comment above.
    [blueprintSignature, catalog, pi]
  );
  const materialTypeIds = useMemo(() => typeIdsFromKey(materialTypeIdsKey), [materialTypeIdsKey]);

  const detected = useDetectedOwnedStock(ownedStockSnapshot, materialTypeIds);
  const { detection } = useMemo(
    () => ownedStockView({ ...detected, scope: group.ownedStockScope }, t),
    [detected, group.ownedStockScope, t]
  );

  const ownedStockMap = useMemo(
    () =>
      new Map(Object.entries(group.ownedStock ?? {}).map(([typeID, qty]) => [Number(typeID), qty])),
    [group.ownedStock]
  );

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
        stackAffix: { before: `${t('industry.quantity')} ` },
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
          return (
            <span data-dense-omit>
              {volume === null ? t('common.unknown') : formatVolume(volume)}
            </span>
          );
        },
      },
      {
        id: 'owned',
        header: t('industry.ownedQuantity'),
        stackEdge: 'end',
        align: 'right',
        sortValue: (material) => ownedStockMap.get(material.typeID) ?? 0,
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
                  reduction={detection.reducedFor?.(material.typeID) ?? null}
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
        cardCorner: true,
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
                  <Button size="sm" onClick={() => ownedBulk.fillAll(buyRows)}>
                    {t('industry.useAllOwned')}
                  </Button>
                  <Button size="sm" onClick={() => ownedBulk.clearAll(rollup.tableMaterials)}>
                    {t('industry.useNoneOwned')}
                  </Button>
                </div>
              }
            />
          </div>

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
                responsive="stack"
                stackLayout="dense"
                mobileSort
              />
            </div>
          ) : null}
        </Panel>
        <p className="text-xs text-text-dim">{t('industry.groupEstimateNote')}</p>
      </div>
      <GroupUsedByModal
        typeID={usedByTypeId}
        onClose={() => setUsedByTypeId(null)}
        tableTotal={
          rollup.tableMaterials.find((line) => line.typeID === usedByTypeId)?.quantity ?? null
        }
        consumers={usedByTypeId === null ? [] : groupMaterialConsumers(members, usedByTypeId)}
        nameFor={(typeId) => nameForType(catalog, typeId)}
        onOpenPlan={onOpenPlan}
        itemMenuFor={menuProps.itemMenuFor}
        itemActionsFor={menuProps.itemActionsFor}
      />
      {ownedBulk.toast}
    </>
  );
}
