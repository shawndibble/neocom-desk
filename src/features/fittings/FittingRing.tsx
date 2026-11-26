import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName as MICRO_LABEL } from '@/components/ui/eyebrowClassName';
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, Tooltip } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { AddRow } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
  RING_RACKS,
  RING_SLOT_RADIUS,
  RING_TILE,
  RING_VIEW,
  buildRingSlots,
  ringGhostIndices,
  ringPoint,
  ringSlotAngle,
  ringSlotAngles,
  type RingGauge,
  type RingRack,
  type RingSlot,
  type SlotLayout,
} from '@/engine/fittings/ringLayout';
import { cargoGroups } from '@/engine/fittings/fittingEdit';
import type { HardpointKindOf } from '@/engine/fittings/hardpoints';
import { moduleKey } from '@/engine/fittings/skillGaps';
import { showsDrones } from '@/engine/fittings/stats';
import {
  FITTING_SLOT_KINDS,
  type Fitting,
  type FittingModuleResult,
  type FittingSlotKind,
  type FittingStats,
  type HardpointCounts,
} from '@/engine/fittings/types';
import { SustainedTankReadout } from './FittingTankStats';
import { ringDropFor } from './fittingDrag';
import { useFittingDropTarget, useFittingItemActions } from './fittingItemActions';
import { useOverBudgetFlash } from './useOverBudgetFlash';
import { ringMaxWidth, useRingChrome } from './ring/useRingChrome';
import { type Budget, RimGauge } from './ring/RimGauge';
import { hardpointLabel, pct } from './ring/ringFormat';
import { HardpointPips } from './ring/HardpointPips';
import { Readout, ModuleStateLegend, ShipRender } from './ring/Readout';
import { SlotTile } from './ring/SlotTile';
import { CargoTile, CargoHoldReadout } from './ring/CargoTile';

interface FittingRingProps {
  fitting: Fitting;
  stats: FittingStats | null;
  moduleResults?: FittingModuleResult[] | null;
  unusableModuleKeys?: ReadonlySet<string>;
  typeName?: (typeId: number) => string;
  onSlotSelect?: (rack: FittingSlotKind, index: number) => void;
  onDropType?: (rack: FittingSlotKind, index: number, typeId: number) => void;
  onMoveModule?: (rack: FittingSlotKind, from: number, to: number) => void;
  compact?: boolean;
  onRackOpen?: (rack: FittingSlotKind) => void;
  droneButton?: ReactNode;
  selectedSlot?: { rack: FittingSlotKind; index: number } | null;
  hardpointsUsed?: HardpointCounts | null;
  hardpointKindOf?: HardpointKindOf;
  actions?: ReactNode;
  titleSwitch?: ReactNode;
  bare?: boolean;
}

function RingFrame({
  bare,
  title,
  leading,
  actions,
  children,
}: {
  bare: boolean;
  title: string;
  leading: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return bare ? (
    <>{children}</>
  ) : (
    <Panel title={leading ? undefined : title} leading={leading} actions={actions}>
      {children}
    </Panel>
  );
}

export function FittingRing({
  fitting,
  stats,
  moduleResults,
  unusableModuleKeys,
  typeName,
  onSlotSelect,
  onDropType,
  onMoveModule,
  compact = false,
  onRackOpen,
  droneButton,
  selectedSlot,
  hardpointsUsed,
  hardpointKindOf,
  actions,
  titleSwitch,
  bare = false,
}: FittingRingProps) {
  const { t } = useTranslation();
  const itemActions = useFittingItemActions();
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const layout = stats?.slotCounts ?? null;
  const slots = buildRingSlots(fitting, layout);
  const openSpace = useFittingDropTarget({ kind: 'ring' }, (payload, handlers) => {
    const placed = ringDropFor(payload, fitting.modules, layout);
    return placed?.kind === 'fit'
      ? !!handlers.addType
      : placed?.kind === 'load' && !!handlers.loadCharge;
  });
  const cargoTarget = useFittingDropTarget({ kind: 'cargo' });
  const readoutsRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const ringWidth = ringMaxWidth(useRingChrome(readoutsRef, ringRef));
  const centre = RING_VIEW / 2;
  const nameOf = (typeId: number) => typeName?.(typeId) ?? `#${typeId}`;

  const cpuUsed = stats?.cpuUsed ?? null;
  const cpuTotal = stats?.cpuTotal ?? null;
  const pgUsed = stats?.powergridUsed ?? null;
  const pgTotal = stats?.powergridTotal ?? null;
  const calUsed = stats?.calibrationUsed ?? null;
  const calTotal = stats?.calibrationTotal ?? null;
  const bwUsed = stats?.droneBandwidthUsed ?? null;
  const bwTotal = stats?.droneBandwidthTotal ?? null;
  const cpuFlash = useOverBudgetFlash(cpuUsed, cpuTotal);
  const pgFlash = useOverBudgetFlash(pgUsed, pgTotal);
  const calFlash = useOverBudgetFlash(calUsed, calTotal);
  const bwFlash = useOverBudgetFlash(bwUsed, bwTotal);
  const budgets: Record<RingGauge, Budget> = {
    cpu: {
      label: t('fittings.list.cpu'),
      used: cpuUsed,
      total: cpuTotal,
      valueKey: 'fittings.ring.readoutCpu',
      flash: cpuFlash,
    },
    powergrid: {
      label: t('fittings.list.powergrid'),
      used: pgUsed,
      total: pgTotal,
      valueKey: 'fittings.ring.readoutPowergrid',
      flash: pgFlash,
    },
    calibration: {
      label: t('fittings.list.calibration'),
      used: calUsed,
      total: calTotal,
      valueKey: 'fittings.ring.readoutCalibration',
      flash: calFlash,
    },
    droneBandwidth: {
      label: t('fittings.list.droneBandwidth'),
      used: bwUsed,
      total: bwTotal,
      valueKey: 'fittings.ring.readoutDroneBandwidth',
      flash: bwFlash,
    },
  };
  const dronesShown = showsDrones(stats, fitting.drones.length);
  const gauges: RingGauge[] = dronesShown
    ? ['calibration', 'droneBandwidth', 'cpu', 'powergrid']
    : ['calibration', 'cpu', 'powergrid'];

  const cantUse = (slot: RingSlot) =>
    slot.module !== undefined && (unusableModuleKeys?.has(moduleKey(slot.module)) ?? false);
  const isSelected = (slot: RingSlot) =>
    selectedSlot === undefined
      ? undefined
      : selectedSlot?.rack === slot.rack && selectedSlot.index === slot.index;
  const resultOf = (slot: RingSlot) =>
    slot.module && moduleResults ? moduleResults[fitting.modules.indexOf(slot.module)] : undefined;
  const maxStateOf = (slot: RingSlot) => resultOf(slot)?.maxState;
  const takesChargesOf = (slot: RingSlot) => {
    const groups = resultOf(slot)?.chargeGroupIds;
    return groups === undefined ? undefined : groups.length > 0;
  };
  const reachedState = (slot: RingSlot) => resultOf(slot)?.state;
  const hardpointOf = (slot: RingSlot) =>
    slot.rack === 'high' && slot.module ? (hardpointKindOf?.(slot.module.typeId) ?? null) : null;

  function tilePosition(angle: number): CSSProperties {
    const p = ringPoint(angle, RING_SLOT_RADIUS);
    return {
      left: pct(centre + p.x - RING_TILE / 2),
      top: pct(centre + p.y - RING_TILE / 2),
      width: pct(RING_TILE),
      height: pct(RING_TILE),
    };
  }

  const ringSlots = slots.filter((slot): slot is RingSlot & { rack: RingRack } =>
    RING_RACKS.includes(slot.rack as RingRack)
  );
  const subsystems = slots.filter((slot) => slot.rack === 'subsystem');
  const cargo = cargoGroups(fitting);
  const counts = Object.fromEntries(
    FITTING_SLOT_KINDS.map((rack) => [rack, slots.filter((slot) => slot.rack === rack).length])
  ) as SlotLayout;
  const angles = ringSlotAngles(counts);
  const ghosts =
    subsystems.length > 0
      ? []
      : RING_RACKS.flatMap((rack) =>
          ringGhostIndices(rack, counts[rack]).map((index) => ({ rack, index }))
        );

  const bandSlots = [...ringSlots, ...subsystems];
  const order = bandSlots.map((slot) => `${slot.rack}-${slot.index}`);
  const tabStop = focusKey !== null && order.includes(focusKey) ? focusKey : order[0];
  function roving(slot: RingSlot) {
    const key = `${slot.rack}-${slot.index}`;
    return {
      tabbable: key === tabStop,
      onFocus: () => setFocusKey(key),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        const at = order.indexOf(key);
        const next =
          event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? order[(at + 1) % order.length]
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? order[(at - 1 + order.length) % order.length]
              : event.key === 'Home'
                ? order[0]
                : event.key === 'End'
                  ? order[order.length - 1]
                  : undefined;
        if (next === undefined) return;
        event.preventDefault();
        setFocusKey(next);
        event.currentTarget.ownerDocument
          .querySelector<HTMLElement>(`[data-ring-slot="${next}"]`)
          ?.focus();
      },
    };
  }

  const tileProps = {
    compact,
    typeName,
    onSelect: onSlotSelect,
    onDropType,
    onMoveModule,
  };
  const sheetRacks: FittingSlotKind[] =
    subsystems.length > 0 ? [...RING_RACKS, 'subsystem'] : [...RING_RACKS];

  const disc = RING_INNER_RADIUS;
  const ringStroke = !compact && openSpace.over ? 'stroke-accent' : 'stroke-line';
  const cargoDrop = !compact && cargoTarget.accepts;

  return (
    <RingFrame bare={bare} title={t('fittings.ring.title')} leading={titleSwitch} actions={actions}>
      <div className="mx-auto w-full max-w-[48rem] space-y-3">
        <div
          ref={ringRef}
          className="relative mx-auto aspect-square w-full"
          style={{ maxWidth: ringWidth }}
          {...(compact ? {} : openSpace.props)}
        >
          <div
            className="absolute overflow-hidden rounded-full bg-bg"
            style={{
              left: pct(centre - disc),
              top: pct(centre - disc),
              width: pct(disc * 2),
              height: pct(disc * 2),
            }}
          >
            <ShipRender typeId={fitting.shipTypeId} />
          </div>
          <svg
            viewBox={`0 0 ${RING_VIEW} ${RING_VIEW}`}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <g>
              <circle
                cx={centre}
                cy={centre}
                r={RING_SLOT_RADIUS}
                className="fill-none stroke-bg"
                strokeWidth={RING_OUTER_RADIUS - RING_INNER_RADIUS}
              />
              <circle
                cx={centre}
                cy={centre}
                r={RING_OUTER_RADIUS}
                className={`fill-none ${ringStroke}`}
              />
              <circle
                cx={centre}
                cy={centre}
                r={RING_INNER_RADIUS}
                className={`fill-none ${ringStroke}`}
              />
            </g>
            {gauges.map((gauge) => (
              <RimGauge key={gauge} gauge={gauge} budget={budgets[gauge]} compact={compact} />
            ))}
            {stats && (
              <>
                <HardpointPips
                  kind="turret"
                  total={stats.hardpoints.turrets}
                  used={hardpointsUsed?.turrets ?? null}
                  compact={compact}
                />
                <HardpointPips
                  kind="launcher"
                  total={stats.hardpoints.launchers}
                  used={hardpointsUsed?.launchers ?? null}
                  compact={compact}
                />
              </>
            )}
          </svg>
          {ghosts.map(({ rack, index }) => {
            const angle = ringSlotAngle(rack, index);
            return (
              <span
                key={`ghost-${rack}-${index}`}
                aria-hidden="true"
                className="absolute border border-line/60 bg-bg/40"
                style={{ ...tilePosition(angle), transform: `rotate(${angle.toFixed(1)}deg)` }}
              />
            );
          })}
          {bandSlots.map((slot) => {
            const angle = angles[slot.rack][slot.index];
            return (
              <SlotTile
                key={`${slot.rack}-${slot.index}`}
                {...tileProps}
                slot={slot}
                cantUse={cantUse(slot)}
                hardpoint={hardpointOf(slot)}
                reachedState={reachedState(slot)}
                maxState={maxStateOf(slot)}
                takesCharges={takesChargesOf(slot)}
                selected={isSelected(slot)}
                {...roving(slot)}
                position={tilePosition(angle)}
                angle={angle}
              />
            );
          })}
        </div>

        {stats && (stats.hardpoints.turrets > 0 || stats.hardpoints.launchers > 0) && (
          <ul className="sr-only">
            {(['turret', 'launcher'] as const).map((kind) => {
              const total = stats.hardpoints[kind === 'turret' ? 'turrets' : 'launchers'];
              const used = hardpointsUsed?.[kind === 'turret' ? 'turrets' : 'launchers'] ?? null;
              if (total === 0 && !used) return null;
              return <li key={kind}>{hardpointLabel(t, kind, used, total)}</li>;
            })}
          </ul>
        )}

        {!compact && (
          <div
            ref={readoutsRef}
            className="mx-auto grid grid-cols-2 gap-x-4 gap-y-2"
            style={{ maxWidth: ringWidth }}
          >
            <Readout gauge="calibration" budget={budgets.calibration} align="start" />
            {dronesShown ? (
              <Readout gauge="droneBandwidth" budget={budgets.droneBandwidth} align="end" />
            ) : (
              <span />
            )}
            <Readout gauge="powergrid" budget={budgets.powergrid} align="start" />
            <Readout gauge="cpu" budget={budgets.cpu} align="end" />
            <SustainedTankReadout stats={stats ?? null} className="col-span-2 text-center" />
          </div>
        )}

        {compact && onRackOpen && (
          <div className="mx-auto grid grid-cols-2 gap-x-4 gap-y-1" style={{ maxWidth: ringWidth }}>
            <Readout gauge="cpu" budget={budgets.cpu} align="start" />
            <Readout gauge="powergrid" budget={budgets.powergrid} align="end" />
            {calFlash.overBudget && (
              <Readout gauge="calibration" budget={budgets.calibration} align="start" />
            )}
          </div>
        )}

        {bandSlots.some((slot) => slot.module !== undefined) && <ModuleStateLegend />}

        {compact && onRackOpen && (
          <>
            <p className="text-center text-xs text-text-dim">{t('fittings.ring.rackHint')}</p>
            <div className="grid grid-cols-2 gap-2">
              {sheetRacks.map((rack) => {
                const inRack = slots.filter((slot) => slot.rack === rack);
                const fitted = inRack.filter((slot) => slot.module !== undefined).length;
                const blocked = inRack.filter(cantUse).length;
                return (
                  <Button
                    key={rack}
                    size="md"
                    className={`w-full justify-between ${blocked > 0 ? 'border-danger' : ''}`}
                    onClick={() => onRackOpen(rack)}
                  >
                    <span>{t(`fittings.list.rack.${rack}`)}</span>
                    <span
                      className={`text-xs font-normal tabular-nums ${blocked > 0 ? 'text-danger' : 'text-text-dim'}`}
                    >
                      {t('fittings.ring.rackCount', {
                        fitted,
                        total: layout?.[rack] ?? inRack.length,
                      })}
                      {blocked > 0 && ` · ${t('fittings.ring.rackCantUse', { count: blocked })}`}
                    </span>
                  </Button>
                );
              })}
              {droneButton}
            </div>
          </>
        )}

        {(cargo.length > 0 || (itemActions !== null && !compact)) && (
          <div
            {...(compact ? {} : cargoTarget.props)}
            className={`rounded-xs ${!cargoDrop ? '' : cargoTarget.over ? 'ring-2 ring-accent/60' : 'outline-1 outline-dashed outline-accent'}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className={MICRO_LABEL}>{t('fittings.list.cargo')}</p>
              {itemActions && <CargoHoldReadout actions={itemActions} />}
            </div>
            <div className="flex flex-wrap gap-2">
              {cargo.map((item) => (
                <CargoTile
                  key={item.typeId}
                  typeId={item.typeId}
                  count={item.quantity}
                  tooltip={t('fittings.ring.cargoTile', {
                    name: nameOf(item.typeId),
                    quantity: formatCount(item.quantity),
                  })}
                />
              ))}
              {itemActions && !compact && (
                <Tooltip content={t('fittings.item.addCargo')}>
                  <button
                    type="button"
                    aria-label={t('fittings.item.addCargo')}
                    onClick={itemActions.openAddCargo}
                    className={cx(
                      'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border border-dashed border-line-bright bg-bg text-text-dim hover:border-accent',
                      interactiveClassName,
                      focusRingClassName
                    )}
                  >
                    <AddRow aria-hidden />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        )}
      </div>
    </RingFrame>
  );
}
