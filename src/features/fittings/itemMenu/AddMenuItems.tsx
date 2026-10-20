import { useTranslation } from 'react-i18next';
import { MenuItem, MenuSeparator } from '@/components/ui';
import type { CandidateRack } from '@/engine/fittings/candidates';
import {
  BuildPlanMenuItems,
  OpenInEveItemMenuItems,
  ShowInfoMenuItem,
} from '@/features/market/ItemContextMenu';
import { ViewInMarketMenuItem } from '@/features/market/ViewInMarketMenuItem';
import { useFittingItemActions } from '../fittingItemActions';
import { CargoMenuItems } from './CargoMenuItems';
import { ChargeLoadItems } from './shared';

/**
 * An Add panel Cargo result's actions: put the asked quantity in the hold,
 * then — once the type is in it — everything the List's cargo row offers
 * (`CargoMenuItems`), so the two can't drift; before that, what any Add
 * panel item offers.
 */
export function AddCargoMenuItems({
  typeId,
  count,
  inHold,
  onAddCargo,
}: {
  typeId: number;
  /** The quantity the tab asks for; below 1, adding is off. */
  count: number;
  inHold: boolean;
  onAddCargo: (typeId: number, quantity: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <MenuItem disabled={count < 1} onSelect={() => onAddCargo(typeId, count)}>
        {t('fittings.add.cargoAddMenu', { count: Math.max(count, 0) })}
      </MenuItem>
      <MenuSeparator />
      {inHold ? <CargoMenuItems typeId={typeId} /> : <AddItemMenuItems typeId={typeId} />}
    </>
  );
}

/** An Add panel item's actions: a module or drone fits, a charge loads. */
export function AddItemMenuItems({
  typeId,
  rack,
}: {
  typeId: number;
  /** Where it fits; undefined for a charge. */
  rack?: CandidateRack;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  if (actions === null) return null;
  const name = actions.typeName(typeId);
  return (
    <>
      {rack !== undefined ? (
        <MenuItem
          disabled={!actions.canFitFirstFree(typeId, rack)}
          onSelect={() => actions.fitFirstFree(typeId, rack)}
        >
          {rack === 'drone' ? t('fittings.item.addToBay') : t('fittings.item.fitFirstFree')}
        </MenuItem>
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
