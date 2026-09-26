import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  NativeSelect,
  Panel,
  RowMoreActions,
  TextInput,
  TypeIcon,
} from '@/components/ui';
import { AddRow, Close, Compare, DragHandle } from '@/components/ui/icons';
import {
  cargoGroups,
  droneBayUsed,
  droneCountMax,
  droneGroups,
  setDroneCountWithinBay,
  type DroneBay,
  reachableModuleStates,
  removeModule,
  setCargoQuantity,
  setDroneCounts,
  setModuleCharge,
  setModuleState,
} from '@/engine/fittings/fittingEdit';
import {
  FITTING_SLOT_KINDS,
  type Fitting,
  type FittingItemState,
  type FittingModule,
  type FittingModuleResult,
  type FittingSlotKind,
  type FittingStats,
  type PilotProfile,
} from '@/engine/fittings/types';
import { moduleKey } from '@/engine/fittings/skillGaps';
import { showsDrones } from '@/engine/fittings/stats';
import { useOverBudgetFlash } from './useOverBudgetFlash';
import { checkCharges } from './dogmaFittingEngine';
import { endFittingDrag, startFittingDrag, type FittingDragPayload } from './fittingDrag';
import {
  CargoMenuItems,
  DroneMenuItems,
  EmptySlotMenuItems,
  FittingItemMenu,
  ModuleMenuItems,
} from './FittingItemMenu';
import { useFittingDropTarget, useFittingItemActions } from './fittingItemActions';
import type { AddTarget } from './addTarget';
import { catalogueTypeName, catalogueVolume, type FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';

const RACK_LABEL_CLASS =
  'mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

interface ResourceBarProps {
  label: string;
  used: number | null;
  total: number | null;
}

/**
 * A CPU/PG/calibration/drone-bandwidth bar. `null` used/total render as a loading skeleton.
 * Over budget turns `danger` with the overage stated in words, and flashes once
 * each time the readout goes from within budget to over (a Character switch
 * that re-states it included) — the `null` gap while it recomputes doesn't count.
 */
function ResourceBar({ label, used, total }: ResourceBarProps) {
  const { t } = useTranslation();
  const { overage, overBudget, flashKey } = useOverBudgetFlash(used, total);
  const known = used !== null && total !== null;
  const pct = known && total > 0 ? Math.min(100, (used / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-28 shrink-0 text-text-dim">{label}</span>
        <div
          role="meter"
          aria-label={label}
          aria-valuenow={known ? used : undefined}
          aria-valuemax={known ? total : undefined}
          className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2"
        >
          {known && (
            <div
              className={`h-full rounded-full ${overBudget ? 'bg-danger' : 'bg-accent'}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <span
          key={flashKey}
          className={`w-24 shrink-0 text-right ${overBudget ? 'text-danger' : 'text-text-dim'} ${flashKey > 0 && overBudget ? 'flash-danger' : ''}`}
        >
          {known ? `${used.toFixed(1)} / ${total.toFixed(1)}` : '…'}
        </span>
      </div>
      {overBudget && (
        <p className="pl-30 text-right text-xs text-danger">
          {t('fittings.list.overBy', { amount: overage.toFixed(1) })}
        </p>
      )}
    </div>
  );
}

export interface EditContext {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  engineReady: boolean;
  profile: PilotProfile | null;
  edit: (change: FittingChange, coalesceKey?: string) => void;
}

export interface ModuleRowProps extends EditContext {
  module: FittingModule;
  /** This module's own calculation — null while it's being worked out. */
  result: FittingModuleResult | null;
  /** The active Character lacks the skills for it. */
  cantUse: boolean;
  /** List view only — Ring opens the same panel via its own slot click; absent inside that panel's own Modal, which needs no further affordance. */
  onOpenVariations?: (slot: FittingSlotKind, slotIndex: number) => void;
  /** The name opens the item's info (the Market's item detail). */
  onShowInfo?: ShowInfo;
  /**
   * A row of the List (or a rack sheet): a drop target, dragged by its grip
   * on a pointer, with Move up / down / to slot in its menu. Off in the
   * module dialog, which shows one module alone.
   */
  inRack?: boolean;
}

/** Opens an item's info — the Market's item detail — by type and name. */
export type ShowInfo = (typeId: number, name: string) => void;

/** A fitted item's name: the way into its info, when there is one. */
function SlotName({
  typeId,
  name,
  onShowInfo,
}: {
  typeId: number;
  name: string;
  onShowInfo?: ShowInfo;
}) {
  if (!onShowInfo) return <span className={SLOT_NAME_CLASS}>{name}</span>;
  return (
    <button
      type="button"
      className={`${SLOT_NAME_CLASS} cursor-pointer text-accent underline-offset-2 hover:underline`}
      onClick={() => onShowInfo(typeId, name)}
    >
      {name}
    </button>
  );
}

export function ModuleRow({
  module,
  result,
  cantUse,
  fitting,
  catalogue,
  engineReady,
  profile,
  edit,
  onOpenVariations,
  onShowInfo,
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
  const shipTypeId = fitting.shipTypeId;

  // Offer only states the module can reach — every state until its own
  // calculation says otherwise — and show the one it reached: a pasted fit
  // asks for "active" everywhere, which a passive module or rig runs online.
  const maxState = result?.maxState ?? 'overload';
  const shownState = result?.state ?? module.state;
  const states = reachableModuleStates(maxState, shownState);

  const chargeGroupIds = result?.chargeGroupIds;
  const charges = useMemo(() => {
    if (!chargeGroupIds || chargeGroupIds.length === 0 || catalogue === null) return [];
    const candidates = chargeGroupIds.flatMap((id) => catalogue.typeIdsByGroup.get(id) ?? []);
    const accepted =
      engineReady && profile !== null
        ? checkCharges(shipTypeId, { slot, typeId }, candidates, profile)
        : new Set(candidates);
    return candidates
      .filter((id) => accepted.has(id))
      .map((id) => ({ id, name: catalogueTypeName(catalogue, id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [chargeGroupIds, catalogue, engineReady, profile, shipTypeId, slot, typeId]);
  const loadedCharge = module.chargeTypeId;
  const loadedListed = loadedCharge === undefined || charges.some((c) => c.id === loadedCharge);

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
          <SlotName typeId={typeId} name={name} onShowInfo={onShowInfo} />
          {cantUse && (
            <span className="shrink-0 rounded-xs border border-danger px-1 text-[0.6875rem] font-semibold text-danger">
              {t('fittings.list.cantUse')}
            </span>
          )}
        </>
      }
      removeLabel={t('fittings.edit.remove', { name })}
      onRemove={() => edit((f) => removeModule(f, slot, slotIndex))}
    >
      <NativeSelect
        size="sm"
        className="w-28 shrink-0"
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
      {(charges.length > 0 || loadedCharge !== undefined) && (
        <NativeSelect
          size="sm"
          className="min-w-0 flex-1 @min-[34rem]:w-56 @min-[34rem]:flex-none"
          aria-label={t('fittings.edit.chargeLabel', { name })}
          value={loadedCharge ?? ''}
          onChange={(event) =>
            edit((f) =>
              setModuleCharge(
                f,
                slot,
                slotIndex,
                event.target.value === '' ? null : Number(event.target.value)
              )
            )
          }
        >
          <option value="">{t('fittings.edit.noCharge')}</option>
          {!loadedListed && loadedCharge !== undefined && (
            <option value={loadedCharge}>{catalogueTypeName(catalogue, loadedCharge)}</option>
          )}
          {charges.map((charge) => (
            <option key={charge.id} value={charge.id}>
              {charge.name}
            </option>
          ))}
        </NativeSelect>
      )}
      {onOpenVariations && (
        <IconButton
          icon={<Compare />}
          variant="plain"
          label={t('fittings.list.variationsFor', { name })}
          tooltip={t('fittings.variations.title')}
          onClick={() => onOpenVariations(slot, slotIndex)}
        />
      )}
    </SlotCard>
  );
}

const SLOT_NAME_CLASS =
  'line-clamp-2 min-w-0 flex-1 text-left text-sm break-words @min-[34rem]:truncate @min-[34rem]:text-xs';

/**
 * A fitted module's, drone's or cargo item's card. In a narrow column (a
 * phone) the name gets the first line to itself — two lines if it needs
 * them — with its menu and remove in the top-right corner as on the app's
 * other cards, and the controls below; with room, it is one line, remove
 * last. With `menu`, right-click (or touch-and-hold) anywhere on it opens the
 * item's menu, and a ⋮ button opens the same.
 */
function SlotCard({
  identity,
  removeLabel,
  onRemove,
  children,
  menu,
  drop,
  grip,
}: {
  identity: ReactNode;
  removeLabel: string;
  onRemove: () => void;
  children: ReactNode;
  menu?: { name: string; items: ReactNode } | null;
  /** From `useFittingDropTarget`: the card takes the List's drags. */
  drop?: ReturnType<typeof useFittingDropTarget>;
  /** A pointer's drag handle for the card, and what dragging it carries. */
  grip?: { payload: FittingDragPayload; label: string };
}) {
  const highlight = drop?.over
    ? 'ring-2 ring-accent/60'
    : drop?.lights === 'lit' || drop?.accepts
      ? 'outline-1 outline-dashed outline-accent'
      : '';
  const card = (
    <div
      className={`@container rounded-xs bg-panel-2 ${highlight} ${drop?.lights === 'dim' ? 'opacity-40' : ''}`}
      {...drop?.props}
    >
      <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1.5 p-1.5 @min-[34rem]:flex-nowrap">
        <div
          className={`flex min-h-9 min-w-0 basis-full items-center gap-2 @min-[34rem]:min-h-0 @min-[34rem]:flex-1 @min-[34rem]:basis-0 @min-[34rem]:pr-0 ${menu ? 'pr-22' : 'pr-11'}`}
        >
          {grip && (
            <span
              draggable
              role="img"
              aria-label={grip.label}
              title={grip.label}
              onDragStart={(event) => startFittingDrag(event, grip.payload)}
              onDragEnd={endFittingDrag}
              className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-text-dim active:cursor-grabbing"
            >
              <DragHandle aria-hidden />
            </span>
          )}
          {identity}
        </div>
        {/* The controls keep their own right-click and press-and-hold (a count
            box's paste or text selection) rather than opening the item's menu. */}
        <div
          className="flex min-w-0 basis-full items-center gap-2 @min-[34rem]:basis-auto"
          onContextMenu={menu ? (event) => event.stopPropagation() : undefined}
          onPointerDown={menu ? (event) => event.stopPropagation() : undefined}
        >
          {children}
        </div>
        <div className="absolute top-0 right-0 flex @min-[34rem]:static">
          {menu && <RowMoreActions />}
          <IconButton
            icon={<Close />}
            tone="danger"
            variant="plain"
            label={removeLabel}
            onClick={onRemove}
          />
        </div>
      </div>
    </div>
  );
  return menu ? (
    <FittingItemMenu name={menu.name} items={menu.items}>
      {card}
    </FittingItemMenu>
  ) : (
    card
  );
}

/**
 * A drone or cargo count box. Keeps what's being typed as a local draft, so
 * the box can be emptied on the way to a new number instead of snapping back;
 * each complete number is committed as it's typed — capped at `max` when
 * given (for drones, what the bay holds), a number over it showing as the cap.
 * With `min`, a number below it stays a draft rather than being committed.
 */
function CountInput({
  label,
  value,
  max = Number.POSITIVE_INFINITY,
  min = 0,
  onCommit,
}: {
  label: string;
  value: number;
  max?: number;
  min?: number;
  onCommit: (count: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1 text-xs text-text-dim">
      {label}
      <TextInput
        type="number"
        min={min}
        max={Number.isFinite(max) ? max : undefined}
        size="sm"
        className="w-16"
        value={draft ?? String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < min) {
            setDraft(raw);
            return;
          }
          const count = Math.min(Number(raw), max);
          setDraft(count === Number(raw) ? raw : String(count));
          onCommit(count);
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

function AddSlotButton({
  label,
  selected,
  onClick,
  drop,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  /** From `useFittingDropTarget`: an Add panel module, or a module moved along its rack, lands here. */
  drop?: ReturnType<typeof useFittingDropTarget>;
}) {
  return (
    <Button
      align="start"
      className={`w-full border border-dashed ${selected || drop?.over ? 'border-accent bg-accent/10' : drop?.accepts ? 'border-accent' : 'border-line'}`}
      aria-pressed={selected}
      onClick={onClick}
      {...drop?.props}
    >
      <AddRow aria-hidden />
      {label}
    </Button>
  );
}

/**
 * An empty List slot: tap to add there, drop a module on it. With the
 * editor's actions it has the Ring's empty-slot menu too (Add module ▸,
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
  onOpenVariations?: (slot: FittingSlotKind, slotIndex: number) => void;
  onShowInfo?: ShowInfo;
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
  onOpenVariations,
  onShowInfo,
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
                onOpenVariations={onOpenVariations}
                onShowInfo={onShowInfo}
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

interface DroneSectionProps {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  stats: FittingStats | null;
  edit: EditContext['edit'];
  target: AddTarget | null;
  onSelectTarget: (target: AddTarget) => void;
  onShowInfo?: ShowInfo;
  /**
   * `list`: a section of the List, headed "Drones" under the List's own
   * resource bars. `panel`: the Ring's drone panel or the phone's sheet —
   * titled already, so no heading, and carrying its own bandwidth and bay bars.
   */
  variant?: 'list' | 'panel';
}

/**
 * The Fitting's drones: each type with how many are launched (these count
 * toward DPS) and how many wait in the bay, capped at what the bay holds, and
 * a way to add more. The List's Drones section, the Ring's drone panel, and
 * the phone Ring's Drones sheet. Nothing on a hull that takes no drones.
 */
export function DroneSection({
  fitting,
  catalogue,
  stats,
  edit,
  target,
  onSelectTarget,
  onShowInfo,
  variant = 'list',
}: DroneSectionProps) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const drop = useFittingDropTarget({ kind: 'drones' });
  const drones = droneGroups(fitting);
  const droneVolume = (typeId: number) => catalogueVolume(catalogue, typeId);
  // Before the ship data the bay's size is unknown, so nothing is capped yet.
  const bay: DroneBay | null =
    stats === null ? null : { capacity: stats.droneCapacity, volumeOf: droneVolume };
  if (!showsDrones(stats, drones.length)) return null;
  return (
    // A drone dragged here (from the bay below, or the Add panel) launches.
    <div
      className={`space-y-1.5 rounded-xs ${drop.over ? 'ring-2 ring-accent/60' : drop.accepts ? 'outline-1 outline-dashed outline-accent' : ''}`}
      {...drop.props}
    >
      {variant === 'list' && <p className={RACK_LABEL_CLASS}>{t('fittings.list.drones')}</p>}
      {variant === 'panel' && (
        <div className="space-y-1.5">
          <ResourceBar
            label={t('fittings.list.droneBandwidth')}
            used={stats?.droneBandwidthUsed ?? null}
            total={stats?.droneBandwidthTotal ?? null}
          />
          <ResourceBar
            label={t('fittings.list.droneBay')}
            used={catalogue === null ? null : droneBayUsed(fitting, droneVolume)}
            total={stats?.droneCapacity ?? null}
          />
        </div>
      )}
      {drones.length > 0 && (
        <p className="text-xs text-text-dim">{t('fittings.edit.dronesHint')}</p>
      )}
      <div className="space-y-1.5">
        {drones.map((group) => {
          const name = catalogueTypeName(catalogue, group.typeId);
          return (
            <SlotCard
              key={group.typeId}
              menu={
                actions && {
                  name,
                  items: (
                    <DroneMenuItems
                      typeId={group.typeId}
                      inSpace={group.inSpace}
                      inBay={group.inBay}
                    />
                  ),
                }
              }
              grip={
                group.inBay > 0 && actions?.dropHandlers.launchDrone
                  ? {
                      payload: { kind: 'drone', typeId: group.typeId },
                      label: t('fittings.item.dragToLaunch', { name }),
                    }
                  : undefined
              }
              identity={
                <>
                  <TypeIcon typeId={group.typeId} size={32} width={24} height={24} />
                  <SlotName typeId={group.typeId} name={name} onShowInfo={onShowInfo} />
                </>
              }
              removeLabel={t('fittings.edit.remove', { name })}
              onRemove={() =>
                edit((f) => setDroneCounts(f, group.typeId, { inSpace: 0, inBay: 0 }))
              }
            >
              <CountInput
                label={t('fittings.edit.inSpace')}
                value={group.inSpace}
                max={droneCountMax(fitting, group.typeId, 'inSpace', bay)}
                onCommit={(inSpace) =>
                  edit(
                    (f) => setDroneCountWithinBay(f, group.typeId, { inSpace }, bay),
                    `drone-space-${group.typeId}`
                  )
                }
              />
              <CountInput
                label={t('fittings.edit.inBay')}
                value={group.inBay}
                max={droneCountMax(fitting, group.typeId, 'inBay', bay)}
                onCommit={(inBay) =>
                  edit(
                    (f) => setDroneCountWithinBay(f, group.typeId, { inBay }, bay),
                    `drone-bay-${group.typeId}`
                  )
                }
              />
            </SlotCard>
          );
        })}
        <AddSlotButton
          label={t('fittings.edit.addDrones')}
          selected={target?.kind === 'drone'}
          onClick={() => onSelectTarget({ kind: 'drone' })}
        />
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
  onOpenVariations?: (slot: FittingSlotKind, slotIndex: number) => void;
  onShowInfo?: ShowInfo;
  /** The panel header's controls — the page's "+ Add module". */
  actions?: ReactNode;
}

/**
 * The editable List view (issue #1533): every slot the hull has, filled or
 * empty — tap an empty one to add there — with each module's state, charge
 * and remove control, and the drones split between space and bay. Empty
 * slots need the ship data (a rack's size is a ship attribute), so until it
 * has loaded only what's fitted shows.
 */
export function FittingRackList({
  fitting,
  stats,
  moduleResults,
  catalogue,
  engineReady,
  profile,
  edit,
  target,
  onSelectTarget,
  unusableModuleKeys,
  onOpenVariations,
  onShowInfo,
  actions,
}: FittingRackListProps) {
  const { t } = useTranslation();
  const context = { fitting, catalogue, engineReady, profile, edit };
  const drones = droneGroups(fitting);
  const dronesShown = showsDrones(stats, drones.length);
  const droneVolume = (typeId: number) => catalogueVolume(catalogue, typeId);

  return (
    <Panel title={t('fittings.list.title')} actions={actions}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <ResourceBar
            label={t('fittings.list.cpu')}
            used={stats?.cpuUsed ?? null}
            total={stats?.cpuTotal ?? null}
          />
          <ResourceBar
            label={t('fittings.list.powergrid')}
            used={stats?.powergridUsed ?? null}
            total={stats?.powergridTotal ?? null}
          />
          <ResourceBar
            label={t('fittings.list.calibration')}
            used={stats?.calibrationUsed ?? null}
            total={stats?.calibrationTotal ?? null}
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

        {!engineReady && (
          <p className="text-xs text-text-dim">{t('fittings.edit.slotsWaitForShipData')}</p>
        )}

        {FITTING_SLOT_KINDS.map((rack) => (
          <RackSlots
            key={rack}
            {...context}
            rack={rack}
            stats={stats}
            moduleResults={moduleResults}
            target={target}
            onSelectTarget={onSelectTarget}
            unusableModuleKeys={unusableModuleKeys}
            onOpenVariations={onOpenVariations}
            onShowInfo={onShowInfo}
          />
        ))}

        <DroneSection
          fitting={fitting}
          catalogue={catalogue}
          stats={stats}
          edit={edit}
          target={target}
          onSelectTarget={onSelectTarget}
          onShowInfo={onShowInfo}
        />

        {/* What a fit carries besides its slots and drones: ammo, paste, filaments, a depot. */}
        <CargoSection fitting={fitting} catalogue={catalogue} edit={edit} onShowInfo={onShowInfo} />
      </div>
    </Panel>
  );
}

/**
 * The cargo hold: how full it is, each item with its count — a charge drags
 * onto the modules that take it, and its menu loads it — and "Add cargo".
 * The List's Cargo section; the Ring shows the same items as tiles.
 */
export function CargoSection({
  fitting,
  catalogue,
  edit,
  onShowInfo,
}: Pick<EditContext, 'fitting' | 'catalogue' | 'edit'> & { onShowInfo?: ShowInfo }) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const cargo = cargoGroups(fitting);
  if (cargo.length === 0 && actions === null) return null;
  const draggable = actions?.dropHandlers.loadCharge ?? false;
  return (
    <div className="space-y-1.5">
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
            menu={actions && { name, items: <CargoMenuItems typeId={item.typeId} /> }}
            grip={
              draggable && actions
                ? {
                    payload: {
                      kind: 'charge',
                      typeId: item.typeId,
                      fromCargo: true,
                      targets: actions.charges.targetsFor(item.typeId),
                    },
                    label: t('fittings.item.dragToLoad', { name }),
                  }
                : undefined
            }
            identity={
              <>
                <TypeIcon typeId={item.typeId} size={32} width={24} height={24} />
                <SlotName typeId={item.typeId} name={name} onShowInfo={onShowInfo} />
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
