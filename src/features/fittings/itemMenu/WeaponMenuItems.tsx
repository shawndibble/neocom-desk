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

/**
 * A weapon group's actions — a stats Offense row, every module of one type
 * holding one charge: change the charge they hold (from cargo), their state,
 * and what the weapon is. Each is one edit for the whole group.
 */
export function WeaponMenuItems({
  modules,
  shownState,
  maxState,
}: {
  /** The group's modules — one type, one charge. */
  modules: readonly FittingModule[];
  /** The state they share; undefined when they differ, so the radio ticks nothing. */
  shownState?: FittingItemState;
  /** The highest they can reach; every state until known. */
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
          {/* Its own component, so the engine is only asked once the submenu opens. */}
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
