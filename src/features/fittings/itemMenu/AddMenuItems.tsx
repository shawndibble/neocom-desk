import { useTranslation } from 'react-i18next';
import { MenuSeparator } from '@/components/ui';
import type { CandidateRack } from '@/engine/fittings/candidates';
import {
  BuildPlanMenuItems,
  OpenInEveItemMenuItems,
  ShowInfoMenuItem,
} from '@/features/market/ItemContextMenu';
import { ViewInMarketMenuItem } from '@/features/market/ViewInMarketMenuItem';
import { useFittingItemActions } from '../fittingItemActions';
import { CargoMenuItems } from './CargoMenuItems';
import { ChargeLoadItems, GuardedMenuItem } from './shared';

export function AddCargoMenuItems({
  typeId,
  count,
  inHold,
  onAddCargo,
}: {
  typeId: number;
  count: number;
  inHold: boolean;
  onAddCargo: (typeId: number, quantity: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <GuardedMenuItem
        reason={count < 1 ? t('fittings.add.cargoAddNone') : null}
        onSelect={() => onAddCargo(typeId, count)}
      >
        {t('fittings.add.cargoAddMenu', { count: Math.max(count, 0) })}
      </GuardedMenuItem>
      <MenuSeparator />
      {inHold ? <CargoMenuItems typeId={typeId} /> : <AddItemMenuItems typeId={typeId} />}
    </>
  );
}

export function AddItemMenuItems({ typeId, rack }: { typeId: number; rack?: CandidateRack }) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  if (actions === null) return null;
  const name = actions.typeName(typeId);
  return (
    <>
      {rack !== undefined ? (
        <GuardedMenuItem
          reason={actions.canFitFirstFree(typeId, rack) ? null : t('fittings.item.noFreeSlot')}
          onSelect={() => actions.fitFirstFree(typeId, rack)}
        >
          {rack === 'drone' ? t('fittings.item.addToBay') : t('fittings.item.fitFirstFree')}
        </GuardedMenuItem>
      ) : (
        <ChargeLoadItems actions={actions} typeId={typeId} fromCargo={false} />
      )}
      <MenuSeparator />
      <ShowInfoMenuItem typeId={typeId} itemName={name} />
      <OpenInEveItemMenuItems typeId={typeId} />
      <ViewInMarketMenuItem typeId={typeId} />
      <BuildPlanMenuItems typeId={typeId} />
    </>
  );
}
