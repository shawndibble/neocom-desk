import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, RowMoreActions, TypeIcon } from '@/components/ui';
import {
  cargoGroups,
  droneBayUsed,
  droneGroups,
  setCargoQuantity,
} from '@/engine/fittings/fittingEdit';
import {
  FITTING_SLOT_KINDS,
  type FittingModule,
  type FittingModuleResult,
  type FittingSlotKind,
  type FittingStats,
} from '@/engine/fittings/types';
import { moduleKey } from '@/engine/fittings/skillGaps';
import { showsDrones } from '@/engine/fittings/stats';
import { EmptySlotMenuItems, FittingItemMenu } from './FittingItemMenu';
import {
  cargoDragPayload,
  useFittingDropTarget,
  useFittingItemActions,
} from './fittingItemActions';
import type { AddTarget } from './addTarget';
import { catalogueTypeName, catalogueVolume } from './useFittingCatalogue';
import { DroneSection } from './FittingDroneSection';
import { ModuleRow } from './FittingModuleRow';
import {
  AddSlotButton,
  CountInput,
  RACK_LABEL_CLASS,
  ResourceBar,
  SlotCard,
  SlotName,
  type EditContext,
} from './RackListParts';

/**
 * An empty List slot: tap to add there, drop a module on it. With the
 * editor's actions it has the Ring's empty-slot menu too (Add module,
 * Paste, Fill rack), on right-click, touch-and-hold or its ⋮.
 */
function EmptySlot({
  rack,
  slotIndex,
  ...button
}: {
  rack: FittingSlotKind;
  slotIndex: number;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const actions = useFittingItemActions();
  const drop = useFittingDropTarget({ kind: 'slot', rack, index: slotIndex, filled: false });
  const slot = <AddSlotButton {...button} drop={drop} />;
  if (actions === null) return slot;
  return (
    <FittingItemMenu
      name={button.label}
      items={<EmptySlotMenuItems rack={rack} index={slotIndex} />}
    >
      {/* The ⋮ sits beside the slot's button, never inside it. */}
      <div className="flex items-center gap-1">
        {slot}
        <RowMoreActions />
      </div>
    </FittingItemMenu>
  );
}

/**
 * A rack's heading, which takes drops too: a module goes in the rack's first
 * free slot, a charge into every module that takes it.
 */
function RackHeading({ rack, label }: { rack: FittingSlotKind; label: string }) {
  const drop = useFittingDropTarget({ kind: 'rack', rack });
  return (
    <p
      className={`${RACK_LABEL_CLASS} rounded-xs ${drop.over ? 'bg-accent/15 text-accent' : drop.accepts ? 'text-accent outline-1 outline-dashed outline-accent' : ''}`}
      {...drop.props}
    >
      {label}
    </p>
  );
}

interface RackSlotsProps extends EditContext {
  rack: FittingSlotKind;
  stats: FittingStats | null;
  moduleResults: FittingModuleResult[] | null;
  target: AddTarget | null;
  onSelectTarget: (target: AddTarget) => void;
  unusableModuleKeys?: ReadonlySet<string>;
  /** Hides the rack's own heading — a rack sheet titles it already. */
  hideLabel?: boolean;
}

/**
 * One rack's slots, filled and empty: the List view's rack section, and the
 * whole of the phone Ring's rack sheet (scope decision `20260924-205720`).
 */
export function RackSlots({
  rack,
  stats,
  moduleResults,
  target,
  onSelectTarget,
  unusableModuleKeys,
  hideLabel = false,
  ...context
}: RackSlotsProps) {
  const { t } = useTranslation();
  const fitted: { module: FittingModule; index: number }[] = [];
  context.fitting.modules.forEach((module, index) => {
    if (module.slot === rack) fitted.push({ module, index });
  });
  const slotCounts = stats?.slotCounts ?? null;
  const bySlot = new Map(fitted.map((entry) => [entry.module.slotIndex, entry]));
  const highestFitted = Math.max(-1, ...fitted.map((entry) => entry.module.slotIndex));
  // A module past the rack's end (a pasted over-full fit) still shows, so it can be removed.
  const slotCount = Math.max(slotCounts?.[rack] ?? 0, highestFitted + 1);
  if (slotCount === 0) return null;
  const rackLabel = t(`fittings.list.rack.${rack}`);
  return (
    <div>
      {!hideLabel && <RackHeading rack={rack} label={rackLabel} />}
      <div className="space-y-1.5">
        {Array.from({ length: slotCount }, (_, slotIndex) => {
          const entry = bySlot.get(slotIndex);
          if (entry) {
            return (
              <ModuleRow
                key={slotIndex}
                {...context}
                module={entry.module}
                result={moduleResults?.[entry.index] ?? null}
                cantUse={unusableModuleKeys?.has(moduleKey(entry.module)) ?? false}
                inRack
              />
            );
          }
          // Before ship data, a gap below a fitted module is just a gap — no Add yet.
          if (slotCounts === null) return null;
          return (
            <EmptySlot
              key={slotIndex}
              rack={rack}
              slotIndex={slotIndex}
              label={t('fittings.edit.emptySlot', { rack: rackLabel })}
              selected={
                target?.kind === 'slot' && target.slot === rack && target.slotIndex === slotIndex
              }
              onClick={() => onSelectTarget({ kind: 'slot', slot: rack, slotIndex })}
            />
          );
        })}
      </div>
    </div>
  );
}

interface FittingRackListProps extends EditContext {
  stats: FittingStats | null;
  /** Index-parallel to `fitting.modules`; null while the open fit's own calculation is pending. */
  moduleResults: FittingModuleResult[] | null;
  target: AddTarget | null;
  onSelectTarget: (target: AddTarget) => void;
  /** `moduleKey`s the active Character lacks the skills for. */
  unusableModuleKeys?: ReadonlySet<string>;
  /** The panel header's controls — the page's "+ Add module". */
  actions?: ReactNode;
  /** Stands in for the panel's "List" title: the editor's Ring | List switch. */
  titleSwitch?: ReactNode;
}

/**
 * The editable List view (issue #1533): every slot the hull has, filled or
 * empty — tap an empty one to add there — with each module's state, charge
 * and remove control, and the drones with their launch squares. Empty
 * slots need the ship data (a rack's size is a ship attribute), so until it
 * has loaded only what's fitted shows.
 */
export function FittingRackList({
  fitting,
  stats,
  moduleResults,
  catalogue,
  context,
  edit,
  target,
  onSelectTarget,
  unusableModuleKeys,
  actions,
  titleSwitch,
}: FittingRackListProps) {
  const { t } = useTranslation();
  const editContext = { fitting, catalogue, context, edit };
  const drones = droneGroups(fitting);
  const dronesShown = showsDrones(stats, drones.length);
  const droneVolume = (typeId: number) => catalogueVolume(catalogue, typeId);

  return (
    <Panel title={titleSwitch ?? t('fittings.list.title')} actions={actions}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <ResourceBar
            label={t('fittings.list.cpu')}
            used={stats?.cpuUsed ?? null}
            total={stats?.cpuTotal ?? null}
            resource="cpu"
          />
          <ResourceBar
            label={t('fittings.list.powergrid')}
            used={stats?.powergridUsed ?? null}
            total={stats?.powergridTotal ?? null}
            resource="powergrid"
          />
          <ResourceBar
            label={t('fittings.list.calibration')}
            used={stats?.calibrationUsed ?? null}
            total={stats?.calibrationTotal ?? null}
            resource="calibration"
          />
          {dronesShown && (
            <ResourceBar
              label={t('fittings.list.droneBandwidth')}
              used={stats?.droneBandwidthUsed ?? null}
              total={stats?.droneBandwidthTotal ?? null}
            />
          )}
          {dronesShown && (
            <ResourceBar
              label={t('fittings.list.droneBay')}
              used={catalogue === null ? null : droneBayUsed(fitting, droneVolume)}
              total={stats?.droneCapacity ?? null}
            />
          )}
        </div>

        {context === null && (
          <p className="text-xs text-text-dim">{t('fittings.edit.slotsWaitForShipData')}</p>
        )}

        {FITTING_SLOT_KINDS.map((rack) => (
          <RackSlots
            key={rack}
            {...editContext}
            rack={rack}
            stats={stats}
            moduleResults={moduleResults}
            target={target}
            onSelectTarget={onSelectTarget}
            unusableModuleKeys={unusableModuleKeys}
          />
        ))}

        <DroneSection
          fitting={fitting}
          catalogue={catalogue}
          stats={stats}
          edit={edit}
          target={target}
          onSelectTarget={onSelectTarget}
        />

        {/* What a fit carries besides its slots and drones: ammo, paste, filaments, a depot. */}
        <CargoSection fitting={fitting} catalogue={catalogue} edit={edit} />
      </div>
    </Panel>
  );
}

/**
 * The cargo hold: how full it is, each item with its count — a charge drags
 * onto the modules that take it (or loads from a module's own menu) — and "Add cargo".
 * An Add panel item or charge dropped on it goes in the hold.
 * The List's Cargo section; the Ring shows the same items as tiles.
 */
function CargoSection({
  fitting,
  catalogue,
  edit,
}: Pick<EditContext, 'fitting' | 'catalogue' | 'edit'>) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const drop = useFittingDropTarget({ kind: 'cargo' });
  const cargo = cargoGroups(fitting);
  if (cargo.length === 0 && actions === null) return null;
  const draggable = actions?.dropHandlers.loadCharge ?? false;
  return (
    <div
      {...drop.props}
      className={`space-y-1.5 rounded-xs ${drop.over ? 'ring-2 ring-accent/60' : drop.accepts ? 'outline-1 outline-dashed outline-accent' : ''}`}
    >
      <p className={RACK_LABEL_CLASS}>{t('fittings.list.cargo')}</p>
      {actions && (
        <ResourceBar
          label={t('fittings.list.cargoHold')}
          used={actions.cargoUsed}
          total={actions.cargoCapacity}
        />
      )}
      {cargo.map((item) => {
        const name = catalogueTypeName(catalogue, item.typeId);
        return (
          <SlotCard
            key={item.typeId}
            grip={
              draggable && actions
                ? (() => {
                    const payload = cargoDragPayload(actions, item.typeId);
                    return {
                      payload,
                      label: t(
                        payload.kind === 'type'
                          ? 'fittings.item.dragToFit'
                          : 'fittings.item.dragToLoad',
                        { name }
                      ),
                    };
                  })()
                : undefined
            }
            identity={
              <>
                <TypeIcon typeId={item.typeId} size={32} width={24} height={24} />
                <SlotName typeId={item.typeId} name={name} />
              </>
            }
            removeLabel={t('fittings.edit.remove', { name })}
            onRemove={() => edit((f) => setCargoQuantity(f, item.typeId, 0))}
          >
            <CountInput
              label={t('fittings.edit.quantity')}
              value={item.quantity}
              min={1}
              onCommit={(quantity) =>
                edit((f) => setCargoQuantity(f, item.typeId, quantity), `cargo-${item.typeId}`)
              }
            />
          </SlotCard>
        );
      })}
      {actions && (
        <AddSlotButton
          label={t('fittings.item.addCargo')}
          selected={false}
          onClick={actions.openAddCargo}
        />
      )}
    </div>
  );
}
