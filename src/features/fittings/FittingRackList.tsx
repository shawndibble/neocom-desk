import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, NativeSelect, Panel, TextInput, TypeIcon } from '@/components/ui';
import { AddRow, Close } from '@/components/ui/icons';
import {
  droneGroups,
  removeModule,
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
import { moduleKey, resourceOverage } from '@/engine/fittings/skillGaps';
import { checkCharges } from './dogmaFittingEngine';
import type { AddTarget } from './addTarget';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';

const STATES: readonly FittingItemState[] = ['offline', 'online', 'active', 'overload'];

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
  const known = used !== null && total !== null;
  const pct = known && total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const overage = resourceOverage(used, total);
  const overBudget = overage > 0;

  const [wasOver, setWasOver] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  if (known && overBudget !== wasOver) {
    setWasOver(overBudget);
    if (overBudget) setFlashKey((key) => key + 1);
  }

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

function typeName(catalogue: FittingCatalogue | null, typeId: number): string {
  return catalogue?.types[String(typeId)]?.name ?? `#${typeId}`;
}

interface EditContext {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  engineReady: boolean;
  profile: PilotProfile | null;
  edit: (change: FittingChange, coalesceKey?: string) => void;
}

interface ModuleRowProps extends EditContext {
  module: FittingModule;
  /** This module's own calculation — null while it's being worked out. */
  result: FittingModuleResult | null;
  /** The active Character lacks the skills for it. */
  cantUse: boolean;
}

function ModuleRow({
  module,
  result,
  cantUse,
  fitting,
  catalogue,
  engineReady,
  profile,
  edit,
}: ModuleRowProps) {
  const { t } = useTranslation();
  const name = typeName(catalogue, module.typeId);
  const { slot, slotIndex, typeId } = module;
  const shipTypeId = fitting.shipTypeId;

  // Offer only states the module can reach — every state until its own
  // calculation says otherwise — plus whatever it's set to now.
  const maxState = result?.maxState ?? 'overload';
  const states = STATES.slice(0, STATES.indexOf(maxState) + 1);
  if (!states.includes(module.state)) states.push(module.state);

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
      .map((id) => ({ id, name: typeName(catalogue, id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [chargeGroupIds, catalogue, engineReady, profile, shipTypeId, slot, typeId]);
  const loadedCharge = module.chargeTypeId;
  const loadedListed = loadedCharge === undefined || charges.some((c) => c.id === loadedCharge);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xs bg-panel-2 p-1.5">
      <TypeIcon typeId={typeId} size={32} width={24} height={24} />
      <span className="min-w-0 flex-1 truncate text-xs">{name}</span>
      {cantUse && (
        <span className="shrink-0 rounded-xs border border-danger px-1 text-[0.6875rem] font-semibold text-danger">
          {t('fittings.list.cantUse')}
        </span>
      )}
      <NativeSelect
        size="sm"
        aria-label={t('fittings.edit.stateLabel', { name })}
        value={module.state}
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
            <option value={loadedCharge}>{typeName(catalogue, loadedCharge)}</option>
          )}
          {charges.map((charge) => (
            <option key={charge.id} value={charge.id}>
              {charge.name}
            </option>
          ))}
        </NativeSelect>
      )}
      <IconButton
        icon={<Close />}
        size="sm"
        tone="danger"
        label={t('fittings.edit.remove', { name })}
        onClick={() => edit((f) => removeModule(f, slot, slotIndex))}
      />
    </div>
  );
}

/** Sets one of a drone type's two counts, keeping the other as the Fitting has it now. */
function withDroneCount(
  fitting: Fitting,
  typeId: number,
  counts: Partial<{ inSpace: number; inBay: number }>
): Fitting {
  const current = droneGroups(fitting).find((group) => group.typeId === typeId);
  return setDroneCounts(fitting, typeId, {
    inSpace: counts.inSpace ?? current?.inSpace ?? 0,
    inBay: counts.inBay ?? current?.inBay ?? 0,
  });
}

/**
 * A drone count box. Keeps what's being typed as a local draft, so the box
 * can be emptied on the way to a new number instead of snapping back; each
 * complete number is committed as it's typed.
 */
function DroneCountInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (count: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1 text-xs text-text-dim">
      {label}
      <TextInput
        type="number"
        min={0}
        size="sm"
        className="w-16"
        value={draft ?? String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (raw !== '' && Number.isFinite(Number(raw))) onCommit(Number(raw));
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
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      align="start"
      className={`w-full border border-dashed ${selected ? 'border-accent bg-accent/10' : 'border-line'}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <AddRow aria-hidden />
      {label}
    </Button>
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
}: FittingRackListProps) {
  const { t } = useTranslation();
  const context = { fitting, catalogue, engineReady, profile, edit };
  const modulesByRack = new Map<FittingSlotKind, { module: FittingModule; index: number }[]>();
  for (const rack of FITTING_SLOT_KINDS) modulesByRack.set(rack, []);
  fitting.modules.forEach((module, index) =>
    modulesByRack.get(module.slot)?.push({ module, index })
  );
  const drones = droneGroups(fitting);
  const slotCounts = stats?.slotCounts ?? null;

  return (
    <Panel title={t('fittings.list.title')}>
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
          <ResourceBar
            label={t('fittings.list.droneBandwidth')}
            used={stats?.droneBandwidthUsed ?? null}
            total={stats?.droneBandwidthTotal ?? null}
          />
        </div>

        {!engineReady && (
          <p className="text-xs text-text-dim">{t('fittings.edit.slotsWaitForShipData')}</p>
        )}

        {FITTING_SLOT_KINDS.map((rack) => {
          const fitted = modulesByRack.get(rack) ?? [];
          const bySlot = new Map(fitted.map((entry) => [entry.module.slotIndex, entry]));
          const highestFitted = Math.max(-1, ...fitted.map((entry) => entry.module.slotIndex));
          // A module past the rack's end (a pasted over-full fit) still shows, so it can be removed.
          const slotCount = Math.max(slotCounts?.[rack] ?? 0, highestFitted + 1);
          if (slotCount === 0) return null;
          const rackLabel = t(`fittings.list.rack.${rack}`);
          return (
            <div key={rack}>
              <p className={RACK_LABEL_CLASS}>{rackLabel}</p>
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
                      />
                    );
                  }
                  // Before ship data, a gap below a fitted module is just a gap — no Add yet.
                  if (slotCounts === null) return null;
                  return (
                    <AddSlotButton
                      key={slotIndex}
                      label={t('fittings.edit.emptySlot', { rack: rackLabel })}
                      selected={
                        target?.kind === 'slot' &&
                        target.slot === rack &&
                        target.slotIndex === slotIndex
                      }
                      onClick={() => onSelectTarget({ kind: 'slot', slot: rack, slotIndex })}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        <div>
          <p className={RACK_LABEL_CLASS}>{t('fittings.list.drones')}</p>
          <div className="space-y-1.5">
            {drones.map((group) => {
              const name = typeName(catalogue, group.typeId);
              return (
                <div
                  key={group.typeId}
                  className="flex flex-wrap items-center gap-2 rounded-xs bg-panel-2 p-1.5"
                >
                  <TypeIcon typeId={group.typeId} size={32} width={24} height={24} />
                  <span className="min-w-0 flex-1 truncate text-xs">{name}</span>
                  <DroneCountInput
                    label={t('fittings.edit.inSpace')}
                    value={group.inSpace}
                    onCommit={(inSpace) =>
                      edit(
                        (f) => withDroneCount(f, group.typeId, { inSpace }),
                        `drone-space-${group.typeId}`
                      )
                    }
                  />
                  <DroneCountInput
                    label={t('fittings.edit.inBay')}
                    value={group.inBay}
                    onCommit={(inBay) =>
                      edit(
                        (f) => withDroneCount(f, group.typeId, { inBay }),
                        `drone-bay-${group.typeId}`
                      )
                    }
                  />
                  <IconButton
                    icon={<Close />}
                    size="sm"
                    tone="danger"
                    label={t('fittings.edit.remove', { name })}
                    onClick={() =>
                      edit((f) => setDroneCounts(f, group.typeId, { inSpace: 0, inBay: 0 }))
                    }
                  />
                </div>
              );
            })}
            <AddSlotButton
              label={t('fittings.edit.addDrones')}
              selected={target?.kind === 'drone'}
              onClick={() => onSelectTarget({ kind: 'drone' })}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
