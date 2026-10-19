/** Pieces the item menu's per-item files share. */
import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from '@/components/ui';
import type { FittingModule, FittingSlotKind } from '@/engine/fittings/types';
import type { FittingItemActions } from '../fittingItemActions';
import { slotName } from './menuContext';

/**
 * "Put <charge> in cargo…": the cargo quantity dialog for the charge a module
 * holds, so the spare rounds a fit carries are one step from the weapon
 * instead of a trip through the Add panel. Starts at what the cargo holds.
 */
export function ChargeToCargoItem({
  actions,
  chargeTypeId,
}: {
  actions: FittingItemActions;
  chargeTypeId: number;
}) {
  const { t } = useTranslation();
  return (
    <MenuItem onSelect={() => actions.changeCargoQuantity(chargeTypeId)}>
      {t('fittings.item.chargeToCargo', { name: actions.typeName(chargeTypeId) })}
    </MenuItem>
  );
}

/**
 * A weapon group's charge choices: what the cargo holds that it takes
 * (loaded out of the hold), then every other charge it takes (the hold left
 * alone, as the Add panel's Charges tab does). Not the one it holds now.
 */
export function ChangeChargeItems({
  actions,
  module,
  at,
}: {
  actions: FittingItemActions;
  module: FittingModule;
  at: readonly { slot: FittingSlotKind; slotIndex: number }[];
}) {
  const { t } = useTranslation();
  const current = module.chargeTypeId;
  const inCargo = actions.charges.cargoChargesFor(module).filter((id) => id !== current);
  const others = actions.chargesFor(module).filter((id) => id !== current && !inCargo.includes(id));
  if (inCargo.length === 0 && others.length === 0) {
    return <MenuItem disabled>{t('fittings.item.noCharges')}</MenuItem>;
  }
  const item = (chargeTypeId: number, fromCargo: boolean) => (
    <MenuItem
      key={chargeTypeId}
      onSelect={() => actions.charges.load(chargeTypeId, { fromCargo, only: at })}
    >
      {actions.typeName(chargeTypeId)}
    </MenuItem>
  );
  return (
    <>
      {inCargo.map((id) => item(id, true))}
      {inCargo.length > 0 && others.length > 0 && <MenuSeparator />}
      {others.map((id) => item(id, false))}
    </>
  );
}

/** "Load into all compatible" and "Load into…" for a charge, from cargo or not. */
export function ChargeLoadItems({
  actions,
  typeId,
  fromCargo,
}: {
  actions: FittingItemActions;
  typeId: number;
  fromCargo: boolean;
}) {
  const { t } = useTranslation();
  const targets = actions.charges.targetsFor(typeId);
  return (
    <>
      <MenuItem
        disabled={targets.length === 0}
        onSelect={() => actions.charges.load(typeId, { fromCargo })}
      >
        {targets.length === 0
          ? t('fittings.item.noneTakes')
          : t('fittings.item.loadAllCompatibleCount', { count: targets.length })}
      </MenuItem>
      {targets.length > 0 && (
        <MenuSub>
          <MenuSubTrigger>{t('fittings.item.loadInto')}</MenuSubTrigger>
          <MenuSubContent>
            {targets.map((key) => {
              const [rack, at] = key.split('-') as [FittingSlotKind, string];
              const index = Number(at);
              return (
                <MenuItem
                  key={key}
                  onSelect={() =>
                    actions.charges.load(typeId, {
                      fromCargo,
                      only: { slot: rack, slotIndex: index },
                    })
                  }
                >
                  {slotName(t, rack, index)}
                </MenuItem>
              );
            })}
          </MenuSubContent>
        </MenuSub>
      )}
    </>
  );
}
