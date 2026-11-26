import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { industryTabHref } from './industryTabs';
import { MenuItem as RowMenuItem, RowActionsMenu } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { useCompareSet } from '@/features/market/compareSet';
import { ViewInMarketMenuItem } from '@/features/market/ViewInMarketMenuItem';
import { plannableProductTypeID, type PlannableIndex } from './plannableProduct';
import { applyPlanSeed, type BuildPlanSeed } from './planSeed';
import { usePlannableIndexOnOpen } from './usePlannableIndexOnOpen';

export interface BuildPlanContextMenuProps {
  typeId: number;
  trigger: ReactElement;
  itemName?: string;
  seed?: BuildPlanSeed | null;
  extraItems?: ReactNode;
  omitViewInMarket?: boolean;
}

export function BuildPlanMenuItem({
  typeId,
  seed,
  index,
}: {
  typeId: number;
  seed?: BuildPlanSeed | null;
  index: PlannableIndex | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const productTypeId = index ? plannableProductTypeID(index, typeId) : undefined;
  return (
    <RowMenuItem
      disabled={productTypeId == null}
      onSelect={() => {
        if (productTypeId == null) return;
        const params = new URLSearchParams({ product: String(productTypeId) });
        applyPlanSeed(params, seed ?? null);
        navigate(`${industryTabHref('plans')}?${params.toString()}`);
      }}
    >
      {productTypeId === undefined
        ? t('industry.contextMenu.buildPlanChecking')
        : productTypeId === null
          ? t('industry.contextMenu.noBlueprintOptions')
          : t('industry.contextMenu.buildPlan')}
    </RowMenuItem>
  );
}

function useBuildPlanMenuNodes(
  {
    typeId,
    itemName,
    seed,
    omitViewInMarket,
  }: Pick<BuildPlanContextMenuProps, 'typeId' | 'itemName' | 'seed' | 'omitViewInMarket'>,
  index: PlannableIndex | null
): ReactElement[] {
  const { t } = useTranslation();
  const addToCompare = useCompareSet((state) => state.add);

  const nodes: ReactElement[] = omitViewInMarket
    ? []
    : [<ViewInMarketMenuItem key="viewInMarket" typeId={typeId} />];
  if (itemName !== undefined) {
    nodes.push(
      <RowMenuItem key="addToCompare" onSelect={() => addToCompare({ typeId, itemName })}>
        {t('market.contextMenu.addToCompare')}
      </RowMenuItem>,
      <RowMenuItem key="copyName" onSelect={() => void writeToClipboard(itemName)}>
        {t('market.contextMenu.copyName')}
      </RowMenuItem>
    );
  }
  nodes.push(<BuildPlanMenuItem key="buildPlan" typeId={typeId} seed={seed} index={index} />);
  return nodes;
}

export function BuildPlanContextMenu({
  typeId,
  trigger,
  itemName,
  seed,
  extraItems,
  omitViewInMarket,
}: BuildPlanContextMenuProps) {
  const { index, onOpenChange } = usePlannableIndexOnOpen();
  const items = useBuildPlanMenuNodes({ typeId, itemName, seed, omitViewInMarket }, index);

  return (
    <RowActionsMenu
      name={itemName ?? `#${typeId}`}
      items={
        <>
          {items}
          {extraItems}
        </>
      }
      onOpenChange={onOpenChange}
    >
      {trigger}
    </RowActionsMenu>
  );
}
