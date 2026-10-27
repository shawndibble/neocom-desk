import { useContext } from 'react';
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
import { useFittingItemActions, type FittingItemActions } from '../fittingItemActions';
import { OpenAfterMenuContext, slotName } from './menuContext';
import { ChangeChargeItems, ChargeToCargoItem } from './shared';

/** Load charge (from cargo) and "Load into all compatible", for one module. */
function ModuleChargeItems({
  actions,
  module,
}: {
  actions: FittingItemActions;
  module: FittingModule;
}) {
  const { t } = useTranslation();
  const inCargo = actions.charges.cargoChargesFor(module);
  return (
    <MenuSub>
      <MenuSubTrigger disabled={inCargo.length === 0}>
        {inCargo.length === 0 ? t('fittings.item.noCargoCharge') : t('fittings.item.loadCharge')}
      </MenuSubTrigger>
      <MenuSubContent>
        {inCargo.map((chargeTypeId) => (
          <MenuSub key={chargeTypeId}>
            <MenuSubTrigger>{actions.typeName(chargeTypeId)}</MenuSubTrigger>
            <MenuSubContent>
              <MenuItem
                onSelect={() =>
                  actions.charges.load(chargeTypeId, { fromCargo: true, only: module })
                }
              >
                {t('fittings.item.loadThisOne')}
              </MenuItem>
              <MenuItem onSelect={() => actions.charges.load(chargeTypeId, { fromCargo: true })}>
                {t('fittings.item.loadAllCompatible')}
              </MenuItem>
            </MenuSubContent>
          </MenuSub>
        ))}
      </MenuSubContent>
    </MenuSub>
  );
}

/**
 * "Change charge (all N)" on a Ring tile or List row: the Charge Picker for
 * every fitted module of this type — the weapon group the Offense row's own
 * menu changes. Only with the editor's Fitting to work it out from.
 */
function GroupChangeCharge({
  actions,
  module,
}: {
  actions: FittingItemActions;
  module: FittingModule;
}) {
  const { t } = useTranslation();
  const input = actions.chargePickerInput?.() ?? null;
  if (input === null) return null;
  const at = input.fitting.modules
    .filter((m) => m.typeId === module.typeId)
    .map(({ slot, slotIndex }) => ({ slot, slotIndex }));
  return (
    <MenuSub>
      <MenuSubTrigger>
        {t('fittings.chargePicker.changeChargeGroup', { count: at.length })}
      </MenuSubTrigger>
      <MenuSubContent className="max-h-96 min-w-64 overflow-y-auto">
        <ChargePickerMenuItems
          actions={actions}
          module={module}
          at={at}
          fallback={<ChangeChargeItems actions={actions} module={module} at={at} />}
        />
      </MenuSubContent>
    </MenuSub>
  );
}

/** A fitted module's actions — the Ring tile, the List row, the module dialog. */
export function ModuleMenuItems({
  module,
  shownState,
  maxState,
  withMove = false,
  takesCharges,
}: {
  module: FittingModule;
  /** The state it reached (what the radio ticks). */
  shownState: FittingItemState;
  /** The highest it can reach; every state until known. */
  maxState?: FittingItemState;
  /** Move up / down / to slot — the List's keyboard and touch way to reorder. */
  withMove?: boolean;
  /**
   * Whether the module takes a charge at all (its charge groups); false drops
   * the "Load charge" entries a Damage Control would only show disabled.
   * Unknown (undefined) until its calculation says, when they stay.
   */
  takesCharges?: boolean;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const openAfterMenu = useContext(OpenAfterMenuContext);
  if (actions === null) return null;
  const { slot: rack, slotIndex: index, typeId } = module;
  const name = actions.typeName(typeId);
  const count = actions.slotCount(rack);
  // A subsystem can't be put offline, so its menu has no states to pick.
  const hasStates = rack !== 'subsystem';
  return (
    <>
      {hasStates && (
        <MenuSub>
          <MenuSubTrigger>{t('fittings.item.state')}</MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup
              value={shownState}
              onValueChange={(value) => actions.setState(rack, index, value as FittingItemState)}
            >
              {reachableModuleStates(maxState ?? 'overload', shownState).map((option) => (
                <MenuRadioItem key={option} value={option}>
                  {t(`fittings.ring.menu.state.${option}`)}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
      )}
      {takesCharges !== false && <ModuleChargeItems actions={actions} module={module} />}
      {takesCharges !== false && <GroupChangeCharge actions={actions} module={module} />}
      {module.chargeTypeId !== undefined && (
        <>
          <MenuItem
            onSelect={() => actions.charges.load(module.chargeTypeId!, { fromCargo: false })}
          >
            {t('fittings.item.sameChargeEverywhere', {
              name: actions.typeName(module.chargeTypeId),
            })}
          </MenuItem>
          <MenuItem onSelect={() => actions.unloadCharge(rack, index)}>
            {t('fittings.ring.menu.unload', { name: actions.typeName(module.chargeTypeId) })}
          </MenuItem>
          <ChargeToCargoItem actions={actions} chargeTypeId={module.chargeTypeId} />
        </>
      )}
      <MenuSeparator />
      <MenuItem onSelect={() => actions.copyToAllOfType(rack, index)}>
        {t('fittings.item.copyToAllOfType')}
      </MenuItem>
      {actions.hasVariants(typeId) && (
        <MenuItem onSelect={() => openAfterMenu(() => actions.openVariations(rack, index))}>
          {t('fittings.item.variations')}
        </MenuItem>
      )}
      {actions.canMutate(typeId) && (
        <MenuItem onSelect={() => openAfterMenu(() => actions.openMutation(rack, index))}>
          {t('fittings.mutation.menu')}
        </MenuItem>
      )}
      <MenuItem onSelect={() => actions.copyModule(module)}>
        {t('fittings.item.copyModule')}
      </MenuItem>
      {withMove && count !== null && (
        <>
          <MenuItem disabled={index === 0} onSelect={() => actions.move(rack, index, index - 1)}>
            {t('fittings.item.moveUp')}
          </MenuItem>
          <MenuItem
            disabled={index >= count - 1}
            onSelect={() => actions.move(rack, index, index + 1)}
          >
            {t('fittings.item.moveDown')}
          </MenuItem>
          <MenuSub>
            <MenuSubTrigger disabled={count < 2}>{t('fittings.item.moveTo')}</MenuSubTrigger>
            <MenuSubContent>
              {Array.from({ length: count }, (_, to) => to)
                .filter((to) => to !== index)
                .map((to) => (
                  <MenuItem key={to} onSelect={() => actions.move(rack, index, to)}>
                    {slotName(t, rack, to)}
                  </MenuItem>
                ))}
            </MenuSubContent>
          </MenuSub>
        </>
      )}
      <MenuSeparator />
      <ShowInfoMenuItem typeId={typeId} itemName={name} />
      <OpenInEveItemMenuItems typeId={typeId} />
      <ViewInMarketMenuItem typeId={typeId} />
      <MenuSeparator />
      <MenuItem onSelect={() => actions.removeAllOfType(typeId)}>
        {t('fittings.item.removeAllOfType')}
      </MenuItem>
      <MenuItem className="text-danger" onSelect={() => actions.remove(rack, index)}>
        {t('fittings.ring.menu.remove', { name })}
      </MenuItem>
    </>
  );
}
