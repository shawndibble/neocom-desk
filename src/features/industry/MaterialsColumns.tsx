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
  anyDepth: boolean;
  renderName: (material: MaterialTableRow, inline: boolean) => ReactNode;
  renderHave: (material: MaterialTableRow) => ReactNode;
  renderPrice: (material: MaterialTableRow) => ReactNode;
  renderTotal: (material: MaterialTableRow) => ReactNode;
}

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
      headerCellClassName: 'max-[78.125rem]:w-40',
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
      headerCellClassName: 'w-32',
      sortValue: (material) =>
        material.acquisitionTier ? undefined : (sourcing?.[material.typeID]?.ownedQuantity ?? 0),
      render: renderHave,
    },
    {
      id: 'toBuy',
      header: t('industry.errands.buyColumn'),
      align: 'right',
      className: 'tabular-nums',
      headerCellClassName: 'w-20',
      sortValue: (material) =>
        material.subBuilds.length > 0 ? undefined : material.remainingQuantity,
      render: (material) =>
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
      headerCellClassName: anyDepth ? 'w-44' : 'w-28',
      sortValue: (material) =>
        material.subBuilds.length > 0
          ? undefined
          : (materialRowState(material, sourcing, pricesReady).unitPrice ?? undefined),
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
