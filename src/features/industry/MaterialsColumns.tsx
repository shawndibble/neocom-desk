import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import type { DataTableColumn } from '@/components/ui';
import { rowVolume } from '@/engine/industry/materialVolume';
import type { MaterialSourcingMap } from '@/engine/industry/types';
import { formatVolume } from './format';
import { NotApplicable } from './NotApplicable';
import { materialRowState } from './materialRow';
import type { MaterialTableRow } from './subBuildPlan';
import { formatCount } from '@/lib/formatCount';

interface MaterialsColumnsInput {
  t: TFunction;
  nameFor: (typeID: number) => string;
  volumeFor: (typeID: number) => number | null;
  sourcing: MaterialSourcingMap | undefined;
  pricesReady: boolean;
  /** Wider Price column while a row carries a Depth Price's second line. */
  anyDepth: boolean;
  renderName: (material: MaterialTableRow, inline: boolean) => ReactNode;
  renderHave: (material: MaterialTableRow) => ReactNode;
  renderPrice: (material: MaterialTableRow) => ReactNode;
  renderTotal: (material: MaterialTableRow) => ReactNode;
}

/** The desktop table's columns, in order. Built per render: the renderers close over live edit state. */
export function buildMaterialsColumns({
  t,
  nameFor,
  volumeFor,
  sourcing,
  pricesReady,
  anyDepth,
  renderName,
  renderHave,
  renderPrice,
  renderTotal,
}: MaterialsColumnsInput): DataTableColumn<MaterialTableRow>[] {
  return [
    {
      id: 'material',
      header: t('industry.material'),
      sortValue: (material) => nameFor(material.typeID),
      render: (material) => renderName(material, true),
    },
    {
      id: 'quantity',
      header: t('industry.errands.need'),
      align: 'right',
      className: 'tabular-nums',
      headerCellClassName: 'w-20',
      sortValue: (material) => material.quantity,
      render: (material) => <span>{formatCount(material.quantity)}</span>,
    },
    {
      id: 'owned',
      header: t('industry.errands.haveColumn'),
      align: 'right',
      // The field's own width plus the compact cell padding, and no more.
      headerCellClassName: 'w-24',
      render: renderHave,
    },
    {
      id: 'toBuy',
      header: t('industry.errands.buyColumn'),
      align: 'right',
      className: 'tabular-nums',
      headerCellClassName: 'w-20',
      // A built row is not bought at all, so it sinks rather than sorting as zero.
      sortValue: (material) =>
        material.subBuilds.length > 0 ? undefined : material.remainingQuantity,
      render: (material) =>
        // Built, or already owned in full: nothing to buy.
        material.subBuilds.length > 0 || material.remainingQuantity === 0 ? (
          <NotApplicable />
        ) : (
          <span>{formatCount(material.remainingQuantity)}</span>
        ),
    },
    {
      id: 'price',
      header: t('industry.price'),
      align: 'right',
      // Wider only while a row carries a Depth Price's second line.
      headerCellClassName: anyDepth ? 'w-44' : 'w-28',
      render: renderPrice,
    },
    {
      id: 'volume',
      header: t('industry.volume'),
      align: 'right',
      className: 'tabular-nums',
      headerCellClassName: 'w-24',
      sortValue: (material) =>
        material.subBuilds.length > 0 ? undefined : (rowVolume(material, volumeFor) ?? undefined),
      render: (material) => {
        // A built row's own volume is never hauled at this typeID — its
        // inputs carry it in their own rows.
        if (material.subBuilds.length > 0) return <NotApplicable />;
        const volume = rowVolume(material, volumeFor);
        return <span>{volume === null ? t('common.unknown') : formatVolume(volume)}</span>;
      },
    },
    {
      id: 'lineTotal',
      header: t('industry.errands.total'),
      align: 'right',
      className: 'tabular-nums',
      headerCellClassName: 'w-24',
      sortValue: (material) =>
        material.subBuilds.length > 0
          ? undefined
          : (materialRowState(material, sourcing, pricesReady).lineCost ?? undefined),
      render: renderTotal,
    },
  ];
}
