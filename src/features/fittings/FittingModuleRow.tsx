import { useTranslation } from 'react-i18next';
import { NativeSelect, TypeIcon } from '@/components/ui';
import {
  reachableModuleStates,
  removeModule,
  setModuleState,
  shownModuleState,
} from '@/engine/fittings/fittingEdit';
import type { FittingItemState, FittingModule, FittingModuleResult } from '@/engine/fittings/types';
import { ListChargePicker } from './ListChargePicker';
import { ModuleMenuItems } from './FittingItemMenu';
import { useFittingDropTarget, useFittingItemActions } from './fittingItemActions';
import { MutationBadge } from './MutationBadge';
import { catalogueTypeName } from './useFittingCatalogue';
import { MODULE_STATE_STYLE } from './moduleStateStyle';
import { SlotCard, SlotName, type EditContext } from './RackListParts';

export interface ModuleRowProps extends EditContext {
  module: FittingModule;
  /** This module's own calculation — null while it's being worked out. */
  result: FittingModuleResult | null;
  /** The active Character lacks the skills for it. */
  cantUse: boolean;
  /**
   * A row of the List (or a rack sheet): a drop target, dragged by its grip
   * on a pointer, with Move up / down / to slot in its menu. Off in the
   * module dialog, which shows one module alone.
   */
  inRack?: boolean;
}

export function ModuleRow({
  module,
  result,
  cantUse,
  fitting,
  catalogue,
  context,
  edit,
  inRack = false,
}: ModuleRowProps) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const drop = useFittingDropTarget({
    kind: 'slot',
    rack: module.slot,
    index: module.slotIndex,
    filled: true,
  });
  const name = catalogueTypeName(catalogue, module.typeId);
  const { slot, slotIndex, typeId } = module;

  // Offer only states the module can reach — every state until its own
  // calculation says otherwise — and show the one it reached: a pasted fit
  // asks for "active" everywhere, which a passive module or rig runs online.
  const maxState = result?.maxState ?? 'overload';
  const shownState = shownModuleState(slot, result?.state, module.state);
  const states = reachableModuleStates(maxState, shownState);

  const chargeGroupIds = result?.chargeGroupIds;
  const takesCharges = (chargeGroupIds?.length ?? 0) > 0;
  const loadedCharge = module.chargeTypeId;

  return (
    <SlotCard
      menu={
        actions && {
          name,
          items: (
            <ModuleMenuItems
              module={module}
              shownState={shownState}
              maxState={maxState}
              withMove={inRack}
              takesCharges={chargeGroupIds === undefined ? undefined : chargeGroupIds.length > 0}
            />
          ),
        }
      }
      drop={inRack ? drop : undefined}
      grip={
        inRack && actions?.dropHandlers.moveModule
          ? {
              payload: { kind: 'slot', rack: slot, index: slotIndex },
              label: t('fittings.item.dragToMove', { name }),
            }
          : undefined
      }
      identity={
        <>
          <TypeIcon typeId={typeId} size={32} width={24} height={24} />
          <SlotName typeId={typeId} name={name} />
          <MutationBadge items={[module]} />
          {cantUse && (
            <span className="shrink-0 text-[0.6875rem] font-semibold text-danger">
              {t('fittings.list.cantUse')}
            </span>
          )}
        </>
      }
      removeLabel={t('fittings.edit.remove', { name })}
      onRemove={() => edit((f) => removeModule(f, slot, slotIndex))}
    >
      {slot !== 'subsystem' && (
        <NativeSelect
          size="sm"
          className={`w-28 shrink-0 ${TOUCH_SELECT_CLASS} ${MODULE_STATE_STYLE[shownState].text} [&>select]:text-inherit`}
          aria-label={t('fittings.edit.stateLabel', { name })}
          value={shownState}
          onChange={(event) =>
            edit((f) => setModuleState(f, slot, slotIndex, event.target.value as FittingItemState))
          }
        >
          {states.map((state) => (
            <option key={state} value={state}>
              {t(`fittings.list.moduleState.${state}`)}
            </option>
          ))}
        </NativeSelect>
      )}
      {(takesCharges || loadedCharge !== undefined) && (
        <ListChargePicker
          module={module}
          result={result ?? undefined}
          fitting={fitting}
          catalogue={catalogue}
          context={context}
          edit={edit}
          className="flex-1 @min-[44rem]:w-56 @min-[44rem]:min-w-32 @min-[44rem]:flex-initial"
        />
      )}
    </SlotCard>
  );
}

/**
 * A List select's touch tier: 44px below `md`, its own `sm` height above.
 * `NativeSelect` puts `className` on its wrapper, hence the child selector.
 */
const TOUCH_SELECT_CLASS = '[&>select]:min-h-11 md:[&>select]:min-h-7';
