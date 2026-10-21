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
  /**
   * Index-parallel to `fitting.modules`: what the engine made of each, so a
   * tile names the state a module actually reached (a pasted passive module
   * asks for "active" and runs online). Null while it is calculating.
   */
  moduleResults?: FittingModuleResult[] | null;
  /** `moduleKey`s the active Character lacks the skills for. */
  unusableModuleKeys?: ReadonlySet<string>;
  /** Names for the tiles' tooltips. */
  typeName?: (typeId: number) => string;
  /** Clicking a slot — opens its module, or the Add panel for an empty one. Unused by the phone overview. */
  onSlotSelect?: (rack: FittingSlotKind, index: number) => void;
  /** An Add panel item dropped on a slot of its rack. */
  onDropType?: (rack: FittingSlotKind, index: number, typeId: number) => void;
  /** A fitted module dragged to another slot of its rack. */
  onMoveModule?: (rack: FittingSlotKind, from: number, to: number) => void;
  /**
   * The phone overview (scope decision `20260924-205720`): no readouts,
   * tiles only explain themselves (a tap shows the tooltip), and the rack
   * buttons beneath open a rack's slots via `onRackOpen`.
   */
  compact?: boolean;
  onRackOpen?: (rack: FittingSlotKind) => void;
  /** The phone overview's Drones button, among the rack buttons. */
  droneButton?: ReactNode;
  /** The slot the Add panel is filling, marked on the ring as it is in the List. */
  selectedSlot?: { rack: FittingSlotKind; index: number } | null;
  /** The turrets and launchers the high slots take; null (no pips filled) until known. */
  hardpointsUsed?: HardpointCounts | null;
  /** The hardpoint each high-slot type takes, named in its tile's tooltip; unnamed without it. */
  hardpointKindOf?: HardpointKindOf;
  /** The panel header's controls — the page's "+ Add module". */
  actions?: ReactNode;
  /** No panel of its own, for a host that already frames it (the Start screen's preview). */
  bare?: boolean;
}

function RingFrame({
  bare,
  title,
  actions,
  children,
}: {
  bare: boolean;
  title: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return bare ? (
    <>{children}</>
  ) : (
    <Panel title={title} actions={actions}>
      {children}
    </Panel>
  );
}

/**
 * The game-style Ring view (scope decisions `20260924-205720` and
 * `20260925-095734`): one band with the hull's render
 * filling the disc inside it, square tiles on the band — highs over the top,
 * mids down the right, lows round the bottom, rigs on the left, each rack
 * filling clockwise, with the positions a hull lacks as faint outlines — and
 * the resource budgets as bands on the rim: CPU solid up the lower right,
 * powergrid dashed up the lower left, calibration and drone bandwidth thin
 * above them. Hovering a band gives its numbers; the same numbers sit in a
 * strip beneath the ring laid out as the rim is. A T3's subsystems join the
 * band upper-left, between the rigs and the highs, its racks closing up and
 * dropping the outlines to make room (`ringSlotAngles`). Cargo sits in a row
 * below; the page puts the drones in a panel of their own.
 *
 * Tiles take drops: an Add panel item on a slot of its rack (replacing what
 * it holds), or a fitted module dragged along its rack. Dropped anywhere else
 * on the ring, an item goes where it should (`ringDropFor`); dropped on the
 * cargo row, it goes in the hold. The phone overview (`compact`) is
 * read-only; its rack buttons are the way in.
 */
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
  bare = false,
}: FittingRingProps) {
  const { t } = useTranslation();
  const itemActions = useFittingItemActions();
  // The tile last focused, the ring's tab stop.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const layout = stats?.slotCounts ?? null;
  const slots = buildRingSlots(fitting, layout);
  // Anywhere on the ring that isn't a slot taking the drag: it goes where it should.
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
  // A hull with no drone bay (a Corax) has no bandwidth gauge or readout.
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
  // A T3's band has no room for the positions it lacks.
  const ghosts =
    subsystems.length > 0
      ? []
      : RING_RACKS.flatMap((rack) =>
          ringGhostIndices(rack, counts[rack]).map((index) => ({ rack, index }))
        );

  // One tab stop for the whole ring, not one per tile: the arrow keys walk
  // the slots in ring order (highs, mids, lows, rigs, then subsystems),
  // Home and End jump to either end.
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
  // The phone edits through a sheet per rack; a T3's subsystems get one too.
  const sheetRacks: FittingSlotKind[] =
    subsystems.length > 0 ? [...RING_RACKS, 'subsystem'] : [...RING_RACKS];

  const disc = RING_INNER_RADIUS;
  const ringStroke = !compact && openSpace.over ? 'stroke-accent' : 'stroke-line';
  const cargoDrop = !compact && cargoTarget.accepts;

  return (
    <RingFrame bare={bare} title={t('fittings.ring.title')} actions={actions}>
      {/* The block keeps the ring's own width, so cargo and the legend sit under it on a wide panel. */}
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
            // The readouts' meters carry these numbers for assistive tech; the
            // hover bubbles are a pointer's shortcut to them.
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

        {/* Laid out as the rim is: calibration and powergrid on the left, bandwidth and CPU on the right. */}
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

        {/* The phone editor has no readouts under the ring, so the two budgets that gate a fit sit above the rack buttons. (The Start preview is compact too, but carries its own meters.) */}
        {compact && onRackOpen && (
          <div className="mx-auto grid grid-cols-2 gap-x-4 gap-y-1" style={{ maxWidth: ringWidth }}>
            <Readout gauge="cpu" budget={budgets.cpu} align="start" />
            <Readout gauge="powergrid" budget={budgets.powergrid} align="end" />
            {/* Calibration can gate a fit too, but only earns a line on the phone when it is the one over. */}
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

        {/* What the ring has no slot for; the drones get a panel of their own beneath it. */}
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
