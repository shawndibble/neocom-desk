import { useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Panel,
  Tooltip,
  TypeIcon,
} from '@/components/ui';
import { AddRow, Warn } from '@/components/ui/icons';
import {
  RING_GAUGES,
  RING_GAUGE_RADIUS,
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
  RING_RACKS,
  RING_SLOT_RADIUS,
  RING_TILE,
  RING_VIEW,
  arcPath,
  buildRingSlots,
  gaugeArc,
  hardpointPipAngles,
  ringGhostIndices,
  ringPoint,
  ringSlotAngle,
  type RingGauge,
  type RingRack,
  type RingSlot,
} from '@/engine/fittings/ringLayout';
import { cargoGroups, reachableModuleStates } from '@/engine/fittings/fittingEdit';
import type { HardpointKind } from '@/engine/fittings/hardpoints';
import { moduleKey } from '@/engine/fittings/skillGaps';
import { showsDrones } from '@/engine/fittings/stats';
import type {
  Fitting,
  FittingItemState,
  FittingModuleResult,
  FittingSlotKind,
  FittingStats,
  HardpointCounts,
} from '@/engine/fittings/types';
import { formatCompactNumber } from '@/lib/compactNumber';
import { typeIconUrl, typeRenderUrl } from '@/lib/eveImages';
import {
  activeFittingDrag,
  endFittingDrag,
  startFittingDrag,
  useFittingDrag,
  type FittingDragPayload,
} from './fittingDrag';
import { useOverBudgetFlash } from './useOverBudgetFlash';

/**
 * The ring never grows past this: bigger only spreads the same tiles further
 * apart, and a smaller ring leaves room for the stats beside it. At the cap a
 * tile is 48/648 of it — about 43px.
 */
const RING_MAX_WIDTH = '36rem';

const MICRO_LABEL = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

/**
 * How each rim gauge is drawn. CPU and powergrid are told apart by form as
 * well as side (DESIGN.md: a new series tries form before a new colour): CPU
 * a solid band, powergrid a dashed one. The two lesser budgets are thinner
 * and dim. `dash` is in ring units.
 */
const GAUGE_STYLE: Readonly<
  Record<RingGauge, { width: number; tone: 'accent' | 'dim'; dash?: string }>
> = {
  cpu: { width: 10, tone: 'accent' },
  powergrid: { width: 10, tone: 'accent', dash: '7 3' },
  calibration: { width: 6, tone: 'dim' },
  droneBandwidth: { width: 6, tone: 'dim' },
};

const TONE_STROKE = { accent: 'stroke-accent', dim: 'stroke-text-dim' } as const;

/** Wide enough to be easy to hover without reaching the tiles inside it. */
const GAUGE_HIT_WIDTH = 22;

/** What a fitted tile's right-click menu does; the page's own edits. */
export interface RingModuleActions {
  setState: (rack: FittingSlotKind, index: number, state: FittingItemState) => void;
  unloadCharge: (rack: FittingSlotKind, index: number) => void;
  showInfo: (typeId: number, name: string) => void;
  /** The module dialog, where its variations are. */
  openVariations: (rack: FittingSlotKind, index: number) => void;
  remove: (rack: FittingSlotKind, index: number) => void;
}

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
  /**
   * A fitted tile's right-click menu. The page passes it only on a fine
   * pointer: on touch, Radix opens it on long-press, which is the tooltip's
   * gesture there. The module dialog is the keyboard and touch way to the same.
   */
  moduleActions?: RingModuleActions;
  /** The turrets and launchers the high slots take; null (no pips filled) until known. */
  hardpointsUsed?: HardpointCounts | null;
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

function pct(value: number): string {
  return `${(value / RING_VIEW) * 100}%`;
}

function share(used: number | null, total: number | null): number {
  return used !== null && total !== null && total > 0 ? used / total : Number.NaN;
}

interface Budget {
  label: string;
  used: number | null;
  total: number | null;
  /** `{{used}} / {{total}}` with the resource's unit. */
  valueKey: string;
  flash: ReturnType<typeof useOverBudgetFlash>;
}

function budgetValue(t: ReturnType<typeof useTranslation>['t'], budget: Budget): string | null {
  const { used, total } = budget;
  if (used === null || total === null) return null;
  return t(budget.valueKey, { used: used.toFixed(1), total: total.toFixed(1) });
}

/** A gauge's hover text: the numbers, the share used, and any overage. */
function gaugeTooltip(t: ReturnType<typeof useTranslation>['t'], budget: Budget): string {
  const value = budgetValue(t, budget);
  if (value === null) return t('fittings.ring.gaugeLoading', { label: budget.label });
  const fraction = share(budget.used, budget.total);
  const percent = Number.isFinite(fraction) ? Math.round(fraction * 100) : 0;
  return budget.flash.overBudget
    ? t('fittings.ring.gaugeOver', {
        label: budget.label,
        value,
        percent,
        amount: budget.flash.overage.toFixed(1),
      })
    : t('fittings.ring.gauge', { label: budget.label, value, percent });
}

function RimGauge({
  gauge,
  budget,
  compact,
}: {
  gauge: RingGauge;
  budget: Budget;
  compact: boolean;
}) {
  const { t } = useTranslation();
  const { from, to } = RING_GAUGES[gauge];
  const style = GAUGE_STYLE[gauge];
  const c = RING_VIEW / 2;
  const { filled, empty } = gaugeArc(from, to, share(budget.used, budget.total));
  const fillClass = budget.flash.overBudget ? 'stroke-danger' : TONE_STROKE[style.tone];
  const draw = (range: [number, number]) => arcPath(range[0], range[1], RING_GAUGE_RADIUS, c, c);
  const bands = (
    <>
      {empty && (
        <path
          d={draw(empty)}
          className="fill-none stroke-line"
          strokeWidth={style.width}
          strokeDasharray={style.dash}
        />
      )}
      {filled && (
        <path
          d={draw(filled)}
          className={`fill-none ${fillClass}`}
          strokeWidth={style.width}
          strokeDasharray={style.dash}
        />
      )}
    </>
  );
  // The phone overview has no readouts and a band there is a sliver to tap,
  // so it is just drawn; its numbers are on the List bars and the Stats tab.
  if (compact) return <g data-gauge={gauge}>{bands}</g>;
  return (
    <Tooltip content={gaugeTooltip(t, budget)}>
      {/* The svg itself lets the pointer through to the tiles; only this band catches it. */}
      <g data-gauge={gauge} className="pointer-events-auto">
        <path
          d={arcPath(from, to, RING_GAUGE_RADIUS, c, c)}
          className="fill-none stroke-transparent"
          strokeWidth={GAUGE_HIT_WIDTH}
        />
        {bands}
      </g>
    </Tooltip>
  );
}

/**
 * A kind's hardpoints in words — the tooltip, and the text a screen reader
 * gets for the pips (which are a picture) — naming any overfit, so it isn't
 * told by colour alone.
 */
function hardpointLabel(
  t: ReturnType<typeof useTranslation>['t'],
  kind: HardpointKind,
  used: number | null,
  total: number
): string {
  if (used === null) return t(`fittings.ring.hardpoints.${kind}Loading`, { total });
  const label = t(`fittings.ring.hardpoints.${kind}`, { used, total });
  return used > total ? t('fittings.ring.hardpoints.over', { label, count: used - total }) : label;
}

/** A pip's radius, and the band a pointer hovers to read a kind's numbers. */
const PIP_RADIUS = 5;
const PIP_HIT_WIDTH = 22;

/**
 * One kind of hardpoint on the rim's top gap: a pip each, filled where the
 * high slots take one, red past what the hull has.
 */
function HardpointPips({
  kind,
  total,
  used,
  compact,
}: {
  kind: HardpointKind;
  total: number;
  /** Null until every high-slot type is known: then nothing shows as taken. */
  used: number | null;
  compact: boolean;
}) {
  const { t } = useTranslation();
  const taken = used ?? 0;
  const angles = hardpointPipAngles(kind, Math.max(total, taken));
  if (angles.length === 0) return null;
  const c = RING_VIEW / 2;
  const pips = angles.map((angle, index) => {
    const p = ringPoint(angle, RING_GAUGE_RADIUS);
    const fill =
      index >= total
        ? 'fill-danger stroke-danger'
        : index < taken
          ? 'fill-accent stroke-accent'
          : 'fill-bg stroke-line-bright';
    return (
      <circle
        key={index}
        cx={c + p.x}
        cy={c + p.y}
        r={PIP_RADIUS}
        className={fill}
        strokeWidth={1.5}
      />
    );
  });
  if (compact) return <g data-hardpoints={kind}>{pips}</g>;
  const first = angles[0];
  const last = angles[angles.length - 1];
  return (
    <Tooltip content={hardpointLabel(t, kind, used, total)}>
      <g data-hardpoints={kind} className="pointer-events-auto">
        <path
          d={arcPath(Math.min(first, last) - 2, Math.max(first, last) + 2, RING_GAUGE_RADIUS, c, c)}
          className="fill-none stroke-transparent"
          strokeWidth={PIP_HIT_WIDTH}
        />
        {pips}
      </g>
    </Tooltip>
  );
}

/** A readout's key: a short stroke drawn the way its rim gauge is. */
function GaugeSwatch({ gauge }: { gauge: RingGauge }) {
  const style = GAUGE_STYLE[gauge];
  return (
    <svg viewBox="0 0 20 10" className="h-2.5 w-5 shrink-0" aria-hidden="true">
      <line
        x1={0}
        y1={5}
        x2={20}
        y2={5}
        className={TONE_STROKE[style.tone]}
        strokeWidth={style.width / 2}
        strokeDasharray={style.dash ? '4 2' : undefined}
      />
    </svg>
  );
}

function Readout({
  gauge,
  budget,
  align,
}: {
  gauge: RingGauge;
  budget: Budget;
  /** The side of the ring its gauge is on, so the strip mirrors the rim. */
  align: 'start' | 'end';
}) {
  const { t } = useTranslation();
  const { used, total, flash } = budget;
  const known = used !== null && total !== null;
  const { overBudget, flashKey } = flash;
  const value = budgetValue(t, budget);
  return (
    <div
      role="meter"
      aria-label={budget.label}
      aria-valuenow={known ? used : undefined}
      aria-valuemax={known ? total : undefined}
      className={`min-w-0 text-xs tabular-nums ${align === 'end' ? 'text-right' : ''}`}
    >
      <p
        className={`flex items-center gap-1.5 ${MICRO_LABEL} ${align === 'end' ? 'flex-row-reverse' : ''}`}
      >
        <GaugeSwatch gauge={gauge} />
        <span className="truncate">{budget.label}</span>
      </p>
      <p
        key={flashKey}
        className={`rounded-xs text-sm ${overBudget ? 'font-semibold text-danger' : 'text-text'} ${flashKey > 0 && overBudget ? 'flash-danger' : ''}`}
      >
        {value ?? '…'}
      </p>
      {overBudget && (
        <p className="text-danger">
          {t('fittings.list.overBy', { amount: flash.overage.toFixed(1) })}
        </p>
      )}
    </div>
  );
}

/** The ship's own render, falling back to its icon when the image server has none. */
function ShipRender({ typeId }: { typeId: number }) {
  const [failed, setFailed] = useState(false);
  const [renderedTypeId, setRenderedTypeId] = useState(typeId);
  if (typeId !== renderedTypeId) {
    setRenderedTypeId(typeId);
    setFailed(false);
  }
  return (
    <img
      src={failed ? typeIconUrl(typeId, 128) : typeRenderUrl(typeId, 512)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

/** What a slot will take, given which drops the ring handles at all. */
interface DropHandlers {
  onDropType?: FittingRingProps['onDropType'];
  onMoveModule?: FittingRingProps['onMoveModule'];
}

/**
 * Whether the drag in progress lands on this slot: its own rack only — an Add
 * panel item when drops are handled, a fitted module when moves are and it
 * isn't this slot's own. The one rule both the highlight and the drop read.
 */
function acceptsDrop(
  payload: FittingDragPayload | null,
  slot: RingSlot,
  handlers: DropHandlers
): boolean {
  if (payload === null || payload.rack !== slot.rack) return false;
  if (payload.kind === 'type') return handlers.onDropType !== undefined;
  return handlers.onMoveModule !== undefined && payload.index !== slot.index;
}

interface SlotTileProps extends DropHandlers {
  slot: RingSlot;
  cantUse: boolean;
  /** The state the engine reached, when it has calculated this module. */
  reachedState?: FittingModuleResult['state'];
  /** Whether this is the slot being filled; undefined when nothing can be. */
  selected?: boolean;
  /** The highest state the module can reach, for its menu; every state until known. */
  maxState?: FittingItemState;
  actions?: RingModuleActions;
  /** Where the tile sits; its frame turns with the ring by `angle`, the icon stays upright. */
  position: CSSProperties;
  angle: number;
  compact: boolean;
  typeName?: (typeId: number) => string;
  onSelect?: (rack: FittingSlotKind, index: number) => void;
}

function SlotTile({
  slot,
  cantUse,
  reachedState,
  selected,
  maxState,
  actions,
  position,
  angle,
  compact,
  typeName,
  onSelect,
  onDropType,
  onMoveModule,
}: SlotTileProps) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const drag = useFittingDrag((state) => state.payload);
  const handlers = { onDropType, onMoveModule };
  const { module } = slot;
  const nameOf = (typeId: number) => typeName?.(typeId) ?? `#${typeId}`;
  const rackLabel = t(`fittings.list.rack.${slot.rack}`);
  const index = slot.index + 1;
  const shownState = reachedState ?? module?.state;
  const state = shownState ? t(`fittings.list.moduleState.${shownState}`) : '';
  const label = module
    ? `${t('fittings.ring.slotFitted', { rack: rackLabel, index, state })}${cantUse ? `, ${t('fittings.list.cantUse')}` : ''}`
    : t('fittings.ring.slotEmpty', { rack: rackLabel, index });
  const emptyTooltipKey = compact
    ? 'fittings.ring.tooltipEmptyCompact'
    : onDropType
      ? 'fittings.ring.tooltipEmpty'
      : 'fittings.ring.tooltipEmptyClick';
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
        cantUse ? t('fittings.ring.tooltipCantUse') : null,
      ]
        .filter(Boolean)
        .join('\n')
    : t(emptyTooltipKey, { rack: rackLabel, index });

  // Only an empty tile on the full ring is a "fill this slot" target, as the
  // List's empty-slot buttons are; a fitted one opens its module instead.
  const pressed = !compact && module === undefined ? selected : undefined;

  const border =
    over || pressed
      ? 'border-accent ring-2 ring-accent/50'
      : cantUse
        ? 'border-danger'
        : acceptsDrop(drag, slot, handlers)
          ? 'border-dashed border-accent'
          : module
            ? 'border-line-bright'
            : 'border-dashed border-line-bright';
  const draggable = !compact && module !== undefined && onMoveModule !== undefined;
  const interactive = !compact && onSelect !== undefined;

  function handleDragOver(event: DragEvent) {
    const payload = activeFittingDrag(event);
    if (!acceptsDrop(payload, slot, handlers)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = payload?.kind === 'type' ? 'copy' : 'move';
    setOver(true);
  }

  function handleDrop(event: DragEvent) {
    const payload = activeFittingDrag(event);
    setOver(false);
    if (payload === null || !acceptsDrop(payload, slot, handlers)) return;
    event.preventDefault();
    if (payload.kind === 'type') onDropType?.(slot.rack, slot.index, payload.typeId);
    else onMoveModule?.(slot.rack, payload.index, slot.index);
    endFittingDrag();
  }

  const tile = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={`absolute border bg-bg ${border} ${interactive ? 'cursor-pointer hover:border-accent' : ''} ${draggable ? 'active:cursor-grabbing' : ''}`}
      style={{ ...position, transform: `rotate(${angle.toFixed(1)}deg)` }}
      onClick={interactive ? () => onSelect(slot.rack, slot.index) : undefined}
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => startFittingDrag(event, { kind: 'slot', rack: slot.rack, index: slot.index })
          : undefined
      }
      onDragEnd={draggable ? endFittingDrag : undefined}
      onDragOver={handleDragOver}
      // Moving onto the tile's own icon fires dragleave on the tile; only leaving it counts.
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={handleDrop}
    >
      {/* Counter-turned so the module reads upright wherever its tile sits, as in the game. */}
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ transform: `rotate(${(-angle).toFixed(1)}deg)` }}
      >
        {module ? (
          <TypeIcon
            typeId={module.typeId}
            size={64}
            className={`h-[88%] w-[88%] ${shownState === 'offline' ? 'opacity-35 grayscale' : ''}`}
          />
        ) : (
          <AddRow aria-hidden className="text-text-dim" />
        )}
        {module?.chargeTypeId !== undefined && (
          <span className="absolute right-0 bottom-0 h-[38%] w-[38%] border border-line bg-panel">
            <TypeIcon typeId={module.chargeTypeId} size={32} className="h-full w-full" />
          </span>
        )}
        {/* A corner flag, small enough to leave the module readable under it. */}
        {cantUse && (
          <span className="absolute top-0 right-0 flex h-[34%] w-[34%] bg-danger p-px text-bg">
            <Warn aria-hidden className="h-full w-full" />
          </span>
        )}
      </span>
    </button>
  );

  if (compact || module === undefined || actions === undefined || shownState === undefined) {
    return (
      <Tooltip content={tooltip} openOnTap={compact}>
        {tile}
      </Tooltip>
    );
  }
  const { rack } = slot;
  const slotIndex = slot.index;
  const name = nameOf(module.typeId);
  // A subsystem can't be put offline, so its menu has no states to pick.
  const hasStates = rack !== 'subsystem';
  return (
    <ContextMenu>
      <Tooltip content={tooltip}>
        <ContextMenuTrigger asChild>{tile}</ContextMenuTrigger>
      </Tooltip>
      <ContextMenuContent>
        {hasStates && (
          <>
            <ContextMenuRadioGroup
              value={shownState}
              onValueChange={(value) =>
                actions.setState(rack, slotIndex, value as FittingItemState)
              }
            >
              {reachableModuleStates(maxState ?? 'overload', shownState).map((option) => (
                <ContextMenuRadioItem key={option} value={option}>
                  {t(`fittings.ring.menu.state.${option}`)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
            <ContextMenuSeparator />
          </>
        )}
        {module.chargeTypeId !== undefined && (
          <ContextMenuItem onSelect={() => actions.unloadCharge(rack, slotIndex)}>
            {t('fittings.ring.menu.unload', { name: nameOf(module.chargeTypeId) })}
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={() => actions.showInfo(module.typeId, name)}>
          {t('fittings.ring.menu.info')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.openVariations(rack, slotIndex)}>
          {t('fittings.ring.menu.variations')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-danger" onSelect={() => actions.remove(rack, slotIndex)}>
          {t('fittings.ring.menu.remove', { name })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** A cargo item beneath the ring: its icon, a count, and a tooltip naming it. */
function CargoTile({ typeId, count, tooltip }: { typeId: number; count: number; tooltip: string }) {
  const shown = formatCompactNumber(count);
  return (
    <Tooltip content={tooltip} openOnTap>
      <button
        type="button"
        // The badge's count is visible text, so it belongs in the name (WCAG 2.5.3).
        aria-label={shown === String(count) ? tooltip : `${tooltip} (${shown})`}
        className="relative h-11 w-11 shrink-0 border border-line-bright bg-bg"
      >
        <TypeIcon typeId={typeId} size={64} className="h-full w-full" />
        <span className="absolute right-0 bottom-0 bg-bg/85 px-0.5 text-[0.625rem] leading-tight font-semibold text-text tabular-nums">
          {shown}
        </span>
      </button>
    </Tooltip>
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
 * strip beneath the ring laid out as the rim is. Subsystems (T3s) and cargo
 * sit in rows below; the page puts the drones in a panel of their own.
 *
 * Tiles take drops: an Add panel item on a slot of its rack, or a fitted
 * module dragged along its rack. The phone overview (`compact`) is read-only;
 * its rack buttons are the way in.
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
  moduleActions,
  hardpointsUsed,
  actions,
  bare = false,
}: FittingRingProps) {
  const { t } = useTranslation();
  const layout = stats?.slotCounts ?? null;
  const slots = buildRingSlots(fitting, layout);
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
  const reachedState = (slot: RingSlot) => resultOf(slot)?.state;

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
  const ghosts = RING_RACKS.flatMap((rack) =>
    ringGhostIndices(rack, ringSlots.filter((slot) => slot.rack === rack).length).map((index) => ({
      rack,
      index,
    }))
  );

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

  return (
    <RingFrame bare={bare} title={t('fittings.ring.title')} actions={actions}>
      <div className="space-y-3">
        <div className="relative mx-auto aspect-square w-full" style={{ maxWidth: RING_MAX_WIDTH }}>
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
                className="fill-none stroke-line"
              />
              <circle
                cx={centre}
                cy={centre}
                r={RING_INNER_RADIUS}
                className="fill-none stroke-line"
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
          {ringSlots.map((slot) => {
            const angle = ringSlotAngle(slot.rack, slot.index);
            return (
              <SlotTile
                key={`${slot.rack}-${slot.index}`}
                {...tileProps}
                slot={slot}
                cantUse={cantUse(slot)}
                reachedState={reachedState(slot)}
                maxState={maxStateOf(slot)}
                actions={moduleActions}
                selected={isSelected(slot)}
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
            className="mx-auto grid grid-cols-2 gap-x-4 gap-y-2"
            style={{ maxWidth: RING_MAX_WIDTH }}
          >
            <Readout gauge="calibration" budget={budgets.calibration} align="start" />
            {dronesShown ? (
              <Readout gauge="droneBandwidth" budget={budgets.droneBandwidth} align="end" />
            ) : (
              <span />
            )}
            <Readout gauge="powergrid" budget={budgets.powergrid} align="start" />
            <Readout gauge="cpu" budget={budgets.cpu} align="end" />
          </div>
        )}

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

        {subsystems.length > 0 && (
          <div>
            <p className={MICRO_LABEL}>{t('fittings.list.rack.subsystem')}</p>
            <div className="flex flex-wrap gap-2">
              {subsystems.map((slot) => (
                <div key={slot.index} className="relative h-11 w-11">
                  <SlotTile
                    {...tileProps}
                    slot={slot}
                    cantUse={cantUse(slot)}
                    reachedState={reachedState(slot)}
                    maxState={maxStateOf(slot)}
                    actions={moduleActions}
                    selected={isSelected(slot)}
                    position={{ inset: 0 }}
                    angle={0}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* What the ring has no slot for; the drones get a panel of their own beneath it. */}
        {cargo.length > 0 && (
          <div>
            <p className={MICRO_LABEL}>{t('fittings.list.cargo')}</p>
            <div className="flex flex-wrap gap-2">
              {cargo.map((item) => (
                <CargoTile
                  key={item.typeId}
                  typeId={item.typeId}
                  count={item.quantity}
                  tooltip={t('fittings.ring.cargoTile', {
                    name: nameOf(item.typeId),
                    quantity: item.quantity.toLocaleString(),
                  })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </RingFrame>
  );
}
