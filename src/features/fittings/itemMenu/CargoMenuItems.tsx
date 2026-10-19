import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator } from '@/components/ui';
import { OpenInEveItemMenuItems, ShowInfoMenuItem } from '@/features/market/ItemContextMenu';
import { ViewInMarketMenuItem } from '@/features/market/ViewInMarketMenuItem';
import { useFittingItemActions } from '../fittingItemActions';
import { ChargeLoadItems } from './shared';

/** A cargo item's actions. */
export function CargoMenuItems({ typeId }: { typeId: number }) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  if (actions === null) return null;
  const name = actions.typeName(typeId);
  return (
    <>
      <ChargeLoadItems actions={actions} typeId={typeId} fromCargo />
      <MenuItem onSelect={() => actions.changeCargoQuantity(typeId)}>
        {t('fittings.item.changeQuantity')}
      </MenuItem>
      <MenuSeparator />
      <ShowInfoMenuItem typeId={typeId} itemName={name} />
      <OpenInEveItemMenuItems typeId={typeId} />
      <ViewInMarketMenuItem typeId={typeId} />
      <MenuSeparator />
      <MenuItem className="text-danger" onSelect={() => actions.removeCargo(typeId)}>
        {t('fittings.ring.menu.remove', { name })}
      </MenuItem>
    </>
  );
}
