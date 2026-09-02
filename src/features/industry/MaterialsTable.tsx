import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type DataTableColumn } from '@/components/ui';
import type { EffectiveMaterial, HubPrices } from '@/engine/industry/types';
import { formatIsk } from '@/lib/isk';

interface MaterialsTableProps {
  materials: readonly EffectiveMaterial[];
  nameFor: (typeID: number) => string;
  hubPrices: HubPrices;
  /** False when prices couldn't be fetched at all (offline) — unit price and line total fall back to placeholder text. */
  pricesReady: boolean;
  /** Wraps each row in the shared item context menu; omitted where the caller has no menu to offer. */
  rowContextMenu?: (material: EffectiveMaterial, tr: ReactElement) => ReactElement;
}

/** Materials table: name, effective quantity, unit price, line total. Unpriced rows are flagged. */
export function MaterialsTable({
  materials,
  nameFor,
  hubPrices,
  pricesReady,
  rowContextMenu,
}: MaterialsTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<EffectiveMaterial>[]>(
    () => [
      {
        id: 'material',
        header: t('industry.material'),
        render: (material) => nameFor(material.typeID),
      },
      {
        id: 'quantity',
        header: t('industry.quantity'),
        align: 'right',
        className: 'tabular-nums',
        render: (material) => material.quantity.toLocaleString(),
      },
      {
        id: 'unitPrice',
        header: t('industry.unitPrice'),
        align: 'right',
        className: 'tabular-nums',
        render: (material) => {
          const unitPrice = hubPrices[material.typeID];
          const priced = pricesReady && unitPrice !== undefined;
          return priced ? (
            formatIsk(unitPrice)
          ) : (
            <span className="text-warning">{t('industry.unpriced')}</span>
          );
        },
      },
      {
        id: 'lineTotal',
        header: t('industry.lineTotal'),
        align: 'right',
        className: 'tabular-nums',
        render: (material) => {
          const unitPrice = hubPrices[material.typeID];
          const priced = pricesReady && unitPrice !== undefined;
          return priced ? formatIsk(unitPrice * material.quantity) : t('common.unknown');
        },
      },
    ],
    [t, nameFor, hubPrices, pricesReady]
  );

  return (
    <div className="overflow-x-auto">
      <DataTable
        columns={columns}
        rows={materials}
        rowKey={(material) => material.typeID}
        label={t('industry.materials')}
        density="compact"
        rowContextMenu={rowContextMenu}
      />
    </div>
  );
}
