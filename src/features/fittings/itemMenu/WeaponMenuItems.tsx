import { useTranslation } from 'react-i18next';
import {
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
} from '@/components/ui';
import { reachableModuleStates } from '@/engine/fittings/fittingEdit';
import type { FittingItemState, FittingModule } from '@/engine/fittings/types';
import { OpenInEveItemMenuItems, ShowInfoMenuItem } from '@/features/market/ItemContextMenu';
import { ViewInMarketMenuItem } from '@/features/market/ViewInMarketMenuItem';
import { ChargePickerMenuItems } from '../ChargePickerMenu';
import { useFittingItemActions } from '../fittingItemActions';
import { ChangeChargeItems, ChargeToCargoItem } from './shared';

export function WeaponMenuItems({
  modules,
  shownState,
  maxState,
}: {
  modules: readonly FittingModule[];
  shownState?: FittingItemState;
  maxState?: FittingItemState;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const first = modules[0];
  if (actions === null || first === undefined) return null;
  const at = modules.map(({ slot, slotIndex }) => ({ slot, slotIndex }));
  const name = actions.typeName(first.typeId);
  return (
    <>
      <MenuSub>
        <MenuSubTrigger>{t('fittings.item.changeCharge')}</MenuSubTrigger>
        <MenuSubContent className="max-h-96 min-w-64 overflow-y-auto">
          <ChargePickerMenuItems
            actions={actions}
            module={first}
            at={at}
            fallback={<ChangeChargeItems actions={actions} module={first} at={at} />}
          />
        </MenuSubContent>
      </MenuSub>
      {first.chargeTypeId !== undefined && (
        <>
          <MenuItem onSelect={() => actions.unloadGroup(at)}>
            {t('fittings.ring.menu.unload', { name: actions.typeName(first.chargeTypeId) })}
          </MenuItem>
          <ChargeToCargoItem actions={actions} chargeTypeId={first.chargeTypeId} />
        </>
      )}
      {first.slot !== 'subsystem' && (
        <MenuSub>
          <MenuSubTrigger>{t('fittings.item.state')}</MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup
              value={shownState ?? ''}
              onValueChange={(value) => actions.setGroupState(at, value as FittingItemState)}
            >
              {reachableModuleStates(maxState ?? 'overload', shownState ?? 'offline').map(
                (option) => (
                  <MenuRadioItem key={option} value={option}>
                    {t(`fittings.ring.menu.state.${option}`)}
                  </MenuRadioItem>
                )
              )}
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
      )}
      <MenuSeparator />
      <ShowInfoMenuItem typeId={first.typeId} itemName={name} />
      <OpenInEveItemMenuItems typeId={first.typeId} />
      <ViewInMarketMenuItem typeId={first.typeId} />
    </>
  );
}
