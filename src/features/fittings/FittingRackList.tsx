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
      <div className="flex items-center gap-1">
        {slot}
        <RowMoreActions />
      </div>
    </FittingItemMenu>
  );
}

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
  hideLabel?: boolean;
}

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
  moduleResults: FittingModuleResult[] | null;
  target: AddTarget | null;
  onSelectTarget: (target: AddTarget) => void;
  unusableModuleKeys?: ReadonlySet<string>;
  actions?: ReactNode;
  titleSwitch?: ReactNode;
}

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
    <Panel
      title={titleSwitch ? undefined : t('fittings.list.title')}
      leading={titleSwitch}
      actions={actions}
    >
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

        <CargoSection fitting={fitting} catalogue={catalogue} edit={edit} />
      </div>
    </Panel>
  );
}

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
