import { useEffect, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { industryTabHref } from '@/features/industry/industryTabs';
import {
  DisabledMenuItem,
  MenuGroup,
  MenuItem,
  RowActionsContext,
  RowActionsMenu,
  RowMoreActions,
} from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { marketLinkParams } from '@/engine/market/urlState';
import { usePiPlannable } from '@/features/pi/usePiPlannable';
import { piPlanHref } from '@/features/pi/piPlanLink';
import { useCompareSet } from './compareSet';
import { useItemActions } from './itemActions';
import { StockTargetDialog } from '@/features/stockTargets/StockTargetDialog';
import { OpenInEveMenuItem } from '@/features/openInEve/OpenInEveMenuItem';
import { MarketOnly } from '@/features/abyssal/MarketOnly';
import { loadedMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { ViewInMarketMenuItem } from './ViewInMarketMenuItem';
export { ViewInMarketMenuItem };
import { PriceAlertDialog, PriceAlertMenuItem } from './PriceAlertDialog';

export interface ItemContextMenuProps {
  typeId: number;
  itemName: string;
  itemId?: number;
  blueprintTypeID?: number | null | undefined;
  planProductTypeID?: number;
  onCompareVariations?: () => void;
  onViewInIndustryAsMaterial?: () => void;
  holdingsOnly?: boolean;
  hideStockTarget?: boolean;
  hideBuildPlan?: boolean;
  hideCompare?: boolean;
  extraItems?: ReactNode;
  linksKeepBrowserMenu?: boolean;
  openHref?: string;
  children: ReactElement;
}

export type ItemMenuFor = (
  typeId: number,
  trigger: ReactElement,
  extraItems?: ReactNode
) => ReactElement;

type ItemMenuProps = Omit<ItemContextMenuProps, 'children'>;

export function ShowInfoMenuItem({
  typeId,
  itemName,
  itemId,
}: {
  typeId: number;
  itemName: string;
  itemId?: number;
}) {
  const { t } = useTranslation();
  const { showInfo } = useItemActions();
  return (
    <MenuItem
      onSelect={() =>
        itemId === undefined ? showInfo(typeId, itemName) : showInfo(typeId, itemName, itemId)
      }
    >
      {t('market.contextMenu.showInfo')}
    </MenuItem>
  );
}

export function OpenInEveItemMenuItems({
  typeId,
  specific,
}: {
  typeId: number;
  specific?: boolean;
}) {
  return (
    <MarketOnly typeId={typeId}>
      <OpenInEveMenuItem kind="marketDetails" id={typeId} specific={specific} />
    </MarketOnly>
  );
}

export function BuildPlanMenuItems({ typeId }: { typeId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { blueprintFor, requestBlueprints } = useItemActions();
  useEffect(() => requestBlueprints(), [requestBlueprints]);
  const blueprintTypeID = blueprintFor(typeId);
  const buildPlanLabel =
    blueprintTypeID === undefined
      ? t('industry.contextMenu.buildPlanChecking')
      : blueprintTypeID === null
        ? t('industry.contextMenu.noBlueprintOptions')
        : t('industry.contextMenu.buildPlan');
  return (
    <>
      <MenuItem
        aria-disabled={!blueprintTypeID || undefined}
        onSelect={() => {
          if (blueprintTypeID) navigate(`${industryTabHref('plans')}?product=${typeId}`);
        }}
      >
        {buildPlanLabel}
      </MenuItem>
      {blueprintTypeID ? (
        <MenuItem
          onSelect={() => {
            const params = marketLinkParams(blueprintTypeID, location.search);
            navigate(`/market/browser?${new URLSearchParams(params).toString()}`);
          }}
        >
          {t('market.contextMenu.viewBlueprintInMarket')}
        </MenuItem>
      ) : (
        <DisabledMenuItem reason={buildPlanLabel}>
          {t('market.contextMenu.viewBlueprintInMarket')}
        </DisabledMenuItem>
      )}
    </>
  );
}

function useItemMenuItems(
  props: ItemMenuProps,
  onAlertRequest: () => void,
  onStockTargetRequest: () => void
): ReactNode {
  const {
    typeId,
    itemName,
    itemId,
    planProductTypeID,
    onCompareVariations,
    onViewInIndustryAsMaterial,
    extraItems,
  } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const addToCompare = useCompareSet((state) => state.add);
  const piPlannable = usePiPlannable(typeId);
  const { canAddToQuickbar, addToQuickbar, blueprintFor } = useItemActions();
  const blueprintTypeID = 'blueprintTypeID' in props ? props.blueprintTypeID : blueprintFor(typeId);

  const buildPlanLabel =
    blueprintTypeID === undefined
      ? t('industry.contextMenu.buildPlanChecking')
      : blueprintTypeID === null
        ? t('industry.contextMenu.noBlueprintOptions')
        : t('industry.contextMenu.buildPlan');

  if (props.holdingsOnly) {
    return (
      <>
        <MenuGroup id="primary">
          <ShowInfoMenuItem typeId={typeId} itemName={itemName} itemId={itemId} />
          <ViewInMarketMenuItem typeId={typeId} />
          {!props.hideStockTarget && (
            <MenuItem onSelect={onStockTargetRequest}>{t('stockTargets.dialog.menuItem')}</MenuItem>
          )}
        </MenuGroup>
        {extraItems}
      </>
    );
  }

  const marketItems = loadedMutaplasmidLookup()?.isAbyssalType(typeId) ? 0 : 1;
  return (
    <>
      <MenuGroup id="primary">
        <ShowInfoMenuItem typeId={typeId} itemName={itemName} itemId={itemId} />
        <ViewInMarketMenuItem typeId={typeId} />
        {!props.hideCompare && (
          <MenuItem onSelect={() => addToCompare({ typeId, itemName })}>
            {t('market.contextMenu.addToCompare')}
          </MenuItem>
        )}
        {onCompareVariations && (
          <MenuItem onSelect={onCompareVariations}>
            {t('market.contextMenu.compareVariations')}
          </MenuItem>
        )}
        {!props.hideBuildPlan && (
          <MenuItem
            aria-disabled={!blueprintTypeID || undefined}
            onSelect={() => {
              if (blueprintTypeID)
                navigate(`${industryTabHref('plans')}?product=${planProductTypeID ?? typeId}`);
            }}
          >
            {buildPlanLabel}
          </MenuItem>
        )}
        {onViewInIndustryAsMaterial && (
          <MenuItem onSelect={onViewInIndustryAsMaterial}>
            {t('market.contextMenu.viewInIndustryAsMaterial')}
          </MenuItem>
        )}
        {piPlannable && (
          <MenuItem
            onSelect={() => navigate(piPlanHref(typeId, location.pathname, location.search))}
          >
            {t('market.contextMenu.piPlan')}
          </MenuItem>
        )}
      </MenuGroup>
      <MenuGroup id="track" size={2 * marketItems + (props.hideStockTarget ? 0 : 1)}>
        <MarketOnly typeId={typeId}>
          {canAddToQuickbar ? (
            <MenuItem onSelect={() => addToQuickbar(typeId, itemName)}>
              {t('market.contextMenu.addToQuickbar')}
            </MenuItem>
          ) : (
            <DisabledMenuItem reason={t('market.contextMenu.quickbarNoCharacter')}>
              {t('market.contextMenu.addToQuickbar')}
            </DisabledMenuItem>
          )}
        </MarketOnly>
        <MarketOnly typeId={typeId}>
          <PriceAlertMenuItem
            typeId={typeId}
            available={canAddToQuickbar}
            onSelect={onAlertRequest}
          />
        </MarketOnly>
        {!props.hideStockTarget && (
          <MenuItem onSelect={onStockTargetRequest}>{t('stockTargets.dialog.menuItem')}</MenuItem>
        )}
      </MenuGroup>
      <MenuGroup id="copy">
        <MenuItem onSelect={() => void writeToClipboard(itemName)}>
          {t('market.contextMenu.copyName')}
        </MenuItem>
      </MenuGroup>
      <MenuGroup id="game" size={marketItems}>
        <OpenInEveItemMenuItems typeId={typeId} />
      </MenuGroup>
      {extraItems}
    </>
  );
}

export function ItemContextMenu(props: ItemContextMenuProps) {
  const { typeId, itemName, linksKeepBrowserMenu, openHref, children } = props;
  const [alertOpen, setAlertOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const items = useItemMenuItems(
    props,
    () => setAlertOpen(true),
    () => setStockOpen(true)
  );
  const { requestBlueprints } = useItemActions();

  return (
    <>
      <RowActionsMenu
        name={itemName}
        items={items}
        linksKeepBrowserMenu={linksKeepBrowserMenu}
        openHref={openHref}
        onOpenChange={(open) => {
          if (open) requestBlueprints();
        }}
      >
        {children}
      </RowActionsMenu>
      {alertOpen && (
        <PriceAlertDialog typeId={typeId} itemName={itemName} onClose={() => setAlertOpen(false)} />
      )}
      {stockOpen && (
        <StockTargetDialog
          typeId={typeId}
          itemName={itemName}
          onClose={() => setStockOpen(false)}
        />
      )}
    </>
  );
}

export function ItemMoreActions(
  props: ItemMenuProps & Pick<ComponentProps<typeof RowMoreActions>, 'variant' | 'size'>
) {
  const { typeId, itemName, variant, size } = props;
  const [alertOpen, setAlertOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const items = useItemMenuItems(
    props,
    () => setAlertOpen(true),
    () => setStockOpen(true)
  );
  const { requestBlueprints } = useItemActions();
  const onOpenChange = (open: boolean) => {
    if (open) requestBlueprints();
  };

  return (
    <>
      <RowActionsContext.Provider value={{ name: itemName, items, onOpenChange }}>
        <RowMoreActions variant={variant} size={size} />
      </RowActionsContext.Provider>
      {alertOpen && (
        <PriceAlertDialog typeId={typeId} itemName={itemName} onClose={() => setAlertOpen(false)} />
      )}
      {stockOpen && (
        <StockTargetDialog
          typeId={typeId}
          itemName={itemName}
          onClose={() => setStockOpen(false)}
        />
      )}
    </>
  );
}
