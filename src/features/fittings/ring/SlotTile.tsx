import { useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TypeIcon } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { AddRow, Warn } from '@/components/ui/icons';
import { type RingSlot } from '@/engine/fittings/ringLayout';
import { nextModuleState, shownModuleState } from '@/engine/fittings/fittingEdit';
import type { HardpointKind } from '@/engine/fittings/hardpoints';
import {
  type FittingItemState,
  type FittingModuleResult,
  type FittingSlotKind,
} from '@/engine/fittings/types';
import {
  acceptsDrop,
  activeFittingDrag,
  chargeDragLights,
  dropEffectFor,
  endFittingDrag,
  startFittingDrag,
  useFittingDrag,
  type FittingDragPayload,
} from '../fittingDrag';
import { EmptySlotMenuItems, FittingItemMenu, ModuleMenuItems } from '../FittingItemMenu';
import {
  deleteKeyHandler,
  useFittingItemActions,
  type FittingItemActions,
} from '../fittingItemActions';
import { useUnknownMutation, useUnknownMutationTip } from '../useUnknownMutation';
import { useBreaksRule } from '../ruleBreakFlags';
import { MODULE_STATE_STYLE } from '../moduleStateStyle';
import { useLiftAfterHoldGuard } from '@/components/ui/liftAfterHold';

interface DropHandlers {
  onDropType?: (rack: FittingSlotKind, index: number, typeId: number) => void;
  onMoveModule?: (rack: FittingSlotKind, from: number, to: number) => void;
}

function slotAccepts(
  payload: FittingDragPayload | null,
  slot: RingSlot,
  handlers: DropHandlers,
  actions: FittingItemActions | null
): boolean {
  return acceptsDrop(
    payload,
    { kind: 'slot', rack: slot.rack, index: slot.index, filled: slot.module !== undefined },
    {
      addType: handlers.onDropType !== undefined,
      moveModule: handlers.onMoveModule !== undefined,
      loadCharge: actions?.dropHandlers.loadCharge ?? false,
    }
  );
}

interface SlotTileProps extends DropHandlers {
  slot: RingSlot;
  cantUse: boolean;
  hardpoint: HardpointKind | null;
  reachedState?: FittingModuleResult['state'];
  selected?: boolean;
  maxState?: FittingItemState;
  takesCharges?: boolean;
  position: CSSProperties;
  angle: number;
  compact: boolean;
  typeName?: (typeId: number) => string;
  onSelect?: (rack: FittingSlotKind, index: number) => void;
  tabbable: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onFocus?: () => void;
}

export function SlotTile({
  slot,
  cantUse,
  hardpoint,
  reachedState,
  selected,
  maxState,
  takesCharges,
  position,
  angle,
  compact,
  typeName,
  onSelect,
  onDropType,
  onMoveModule,
  tabbable,
  onKeyDown,
  onFocus,
}: SlotTileProps) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const drag = useFittingDrag((state) => state.payload);
  const actions = useFittingItemActions();
  const handlers = { onDropType, onMoveModule };
  const { module } = slot;
  const nameOf = (typeId: number) => typeName?.(typeId) ?? `#${typeId}`;
  const rackLabel = t(`fittings.list.rack.${slot.rack}`);
  const index = slot.index + 1;
  const shownState = module && shownModuleState(slot.rack, reachedState, module.state);
  const state = shownState ? t(`fittings.list.moduleState.${shownState}`) : '';
  const unknownMutation = useUnknownMutation(module ? [module] : []);
  const unknownMutationTip = useUnknownMutationTip(unknownMutation);
  const breaksRule = useBreaksRule(module);
  const label = module
    ? [
        t('fittings.ring.slotFitted', {
          rack: rackLabel,
          index,
          name: nameOf(module.typeId),
          state,
        }),
        hardpoint ? t(`fittings.ring.hardpoints.${hardpoint}Label`) : null,
        unknownMutation ? t(`fittings.mutation.badge.${unknownMutation}`) : null,
        breaksRule ? t('fittings.ruleBreak.label') : null,
        cantUse ? t('fittings.list.cantUse') : null,
      ]
        .filter(Boolean)
        .join(', ')
    : t('fittings.ring.slotEmpty', { rack: rackLabel, index });
  const emptyTooltipKey = compact
    ? 'fittings.ring.tooltipEmptyCompact'
    : onDropType
      ? 'fittings.ring.tooltipEmpty'
      : 'fittings.ring.tooltipEmptyClick';

  const pressed = !compact && module === undefined ? selected : undefined;
  const lights = chargeDragLights(drag, slot.rack, slot.index);
  const upright = { transform: `rotate(${(-angle).toFixed(1)}deg)` };
  const chargePip =
    module?.chargeTypeId !== undefined ? 'loaded' : module && takesCharges ? 'empty' : undefined;

  const border =
    over || pressed
      ? 'border-accent ring-2 ring-accent/50'
      : cantUse
        ? 'border-danger'
        : slotAccepts(drag, slot, handlers, actions)
          ? 'border-dashed border-accent'
          : module
            ? shownState
              ? MODULE_STATE_STYLE[shownState].border
              : 'border-line-bright'
            : 'border-dashed border-line-bright';
  const draggable = !compact && module !== undefined && onMoveModule !== undefined;
  const interactive = !compact && onSelect !== undefined;
  const menu = !compact && actions !== null;
  const cycles =
    menu && module !== undefined && shownState !== undefined && slot.rack !== 'subsystem';
  const cycleHint =
    cycles && shownState !== undefined
      ? t('fittings.ring.tooltipCycle', {
          state: t(`fittings.ring.state.${nextModuleState(shownState, maxState ?? 'overload')}`),
        })
      : null;
  const tooltip = module
    ? [
        t('fittings.ring.tooltipFitted', {
          rack: rackLabel,
          index,
          name: nameOf(module.typeId),
          state,
        }),
        module.chargeTypeId !== undefined
          ? t('fittings.ring.tooltipCharge', { name: nameOf(module.chargeTypeId) })
          : null,
        hardpoint ? t(`fittings.ring.hardpoints.${hardpoint}Tile`) : null,
        unknownMutationTip,
        breaksRule ? t('fittings.ruleBreak.tooltip') : null,
        cantUse ? t('fittings.ring.tooltipCantUse') : null,
        cycleHint,
      ]
        .filter(Boolean)
        .join('\n')
    : t(emptyTooltipKey, { rack: rackLabel, index });
  const guard = useLiftAfterHoldGuard();
  function cycleState() {
    if (!cycles || !actions || shownState === undefined) return;
    actions.setState(slot.rack, slot.index, nextModuleState(shownState, maxState ?? 'overload'));
  }
  const onDelete = deleteKeyHandler(
    menu && module !== undefined ? () => actions.remove(slot.rack, slot.index) : undefined
  );

  function handleDragOver(event: DragEvent) {
    const payload = activeFittingDrag(event);
    if (payload === null || !slotAccepts(payload, slot, handlers, actions)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = dropEffectFor(payload);
    setOver(true);
  }

  function handleDrop(event: DragEvent) {
    const payload = activeFittingDrag(event);
    setOver(false);
    if (payload === null || !slotAccepts(payload, slot, handlers, actions)) return;
    event.preventDefault();
    if (payload.kind === 'type' && !payload.fromCargo)
      onDropType?.(slot.rack, slot.index, payload.typeId);
    else if (payload.kind === 'slot') onMoveModule?.(slot.rack, payload.index, slot.index);
    else
      actions?.drop(
        payload,
        { kind: 'slot', rack: slot.rack, index: slot.index, filled: module !== undefined },
        event.altKey
      );
    endFittingDrag();
  }

  const tile = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-ring-slot={`${slot.rack}-${slot.index}`}
      data-module-state={module ? shownState : undefined}
      tabIndex={tabbable ? 0 : -1}
      className={`absolute border bg-bg ${border} ${interactiveClassName} ${focusRingClassName} ${lights === 'dim' ? 'opacity-35' : ''} ${interactive ? `cursor-pointer${module === undefined ? ' hover:border-accent' : ''}` : ''} ${draggable ? 'active:cursor-grabbing' : ''}`}
      style={{ ...position, transform: `rotate(${angle.toFixed(1)}deg)` }}
      {...(cycles ? guard.handlers : undefined)}
      onClick={
        interactive || cycles
          ? (event) => {
              if (cycles && guard.swallowClick(event)) return;
              if (cycles && event.detail > 0) cycleState();
              else onSelect?.(slot.rack, slot.index);
            }
          : undefined
      }
      onKeyDown={(event) => {
        if (cycles) guard.handlers.onKeyDown();
        if (
          cycles &&
          event.key === 's' &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          cycleState();
          return;
        }
        onDelete?.(event);
        if (!event.defaultPrevented) onKeyDown?.(event);
      }}
      onFocus={onFocus}
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => startFittingDrag(event, { kind: 'slot', rack: slot.rack, index: slot.index })
          : undefined
      }
      onDragEnd={draggable ? endFittingDrag : undefined}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={handleDrop}
    >
      {chargePip && (
        <span
          aria-hidden="true"
          data-charge-pip={chargePip}
          className={`absolute left-1/4 h-[10%] w-1/2 ${chargePip === 'loaded' ? 'bg-accent' : 'bg-line-bright'}`}
          style={{ top: '-12%' }}
        />
      )}
      <span className="absolute inset-0 overflow-hidden">
        <span className="absolute inset-0 flex items-center justify-center" style={upright}>
          {module ? (
            <TypeIcon
              typeId={module.typeId}
              size={64}
              className={`h-full w-full ${shownState === 'offline' ? 'opacity-35 grayscale' : ''}`}
            />
          ) : (
            <AddRow aria-hidden className="text-text-dim" />
          )}
          {module?.chargeTypeId !== undefined && (
            <span className="absolute inset-0 bg-panel">
              <TypeIcon typeId={module.chargeTypeId} size={64} className="h-full w-full" />
            </span>
          )}
        </span>
      </span>
      <span className="absolute inset-0" style={upright}>
        {unknownMutation && (
          <span
            data-mutation-flag={unknownMutation}
            className="absolute top-0 left-0 flex h-[34%] w-[34%] bg-warning p-px text-bg"
          >
            <Warn aria-hidden className="h-full w-full" />
          </span>
        )}
        {breaksRule && (
          <span
            data-rule-break-flag
            className="absolute right-0 bottom-0 flex h-[34%] w-[34%] bg-warning p-px text-bg"
          >
            <Warn aria-hidden className="h-full w-full" />
          </span>
        )}
        {cantUse && (
          <span className="absolute top-0 right-0 flex h-[34%] w-[34%] bg-danger p-px text-bg">
            <Warn aria-hidden className="h-full w-full" />
          </span>
        )}
      </span>
    </button>
  );

  if (!menu || (module !== undefined && shownState === undefined)) {
    return (
      <Tooltip content={tooltip} openOnTap={compact}>
        {tile}
      </Tooltip>
    );
  }
  return (
    <FittingItemMenu
      name={module ? nameOf(module.typeId) : label}
      tooltip={tooltip}
      items={
        module && shownState ? (
          <ModuleMenuItems
            module={module}
            shownState={shownState}
            maxState={maxState}
            takesCharges={takesCharges}
            withMove
          />
        ) : (
          <EmptySlotMenuItems rack={slot.rack} index={slot.index} />
        )
      }
    >
      {tile}
    </FittingItemMenu>
  );
}
