import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import {
  DisabledMenuItem,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
} from '@/components/ui';
import type { FittingModule, FittingSlotKind } from '@/engine/fittings/types';
import type { FittingItemActions } from '../fittingItemActions';
import { slotName } from './menuContext';

export function GuardedMenuItem({
  reason,
  onSelect,
  children,
}: {
  reason: string | null;
  onSelect: () => void;
  children: ReactNode;
}) {
  return reason === null ? (
    <MenuItem onSelect={onSelect}>{children}</MenuItem>
  ) : (
    <DisabledMenuItem reason={reason}>{children}</DisabledMenuItem>
  );
}

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
    return (
      <DisabledMenuItem reason={t('fittings.item.noCharges')}>
        {t('fittings.item.noCharges')}
      </DisabledMenuItem>
    );
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
      <GuardedMenuItem
        reason={targets.length === 0 ? t('fittings.item.noneTakes') : null}
        onSelect={() => actions.charges.load(typeId, { fromCargo })}
      >
        {targets.length === 0
          ? t('fittings.item.noneTakes')
          : t('fittings.item.loadAllCompatibleCount', { count: targets.length })}
      </GuardedMenuItem>
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
