import { useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, Tooltip, TypeIcon } from '@/components/ui';
import { AddRow, Warn } from '@/components/ui/icons';
import {
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
  RING_RACKS,
  RING_SLOT_RADIUS,
  RING_TICK_INNER,
  RING_TICK_OUTER,
  RING_TILE,
  buildRingSlots,
  gaugeTicks,
  ringGhostIndices,
  ringPoint,
  ringSlotAngle,
  type RingRack,
  type RingSlot,
} from '@/engine/fittings/ringLayout';
import { moduleKey } from '@/engine/fittings/skillGaps';
import { showsDrones } from '@/engine/fittings/stats';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import { typeIconUrl, typeRenderUrl } from '@/lib/eveImages';
import {
  activeFittingDrag,
  endFittingDrag,
  startFittingDrag,
  useFittingDrag,
  type FittingDragPayload,
} from './fittingDrag';
import { useOverBudgetFlash } from './useOverBudgetFlash';

/** The full ring's box: the ring (640 across) plus room either side for the corner readouts. */
const FULL_WIDTH = 760;
/** The phone overview drops the readouts, so its box is just the ring. */
const COMPACT_WIDTH = 640;
const HEIGHT = 640;

const MICRO_LABEL = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

/** Where each rim gauge runs, degrees clockwise from 12 o'clock, and how many ticks it has. */
const GAUGES = {
  calibration: { from: -102, to: -58, ticks: 16 },
  droneBandwidth: { from: 58, to: 94, ticks: 14 },
  cpu: { from: 100, to: 140, ticks: 16 },
  powergrid: { from: 146, to: 200, ticks: 20 },
} as const;

interface FittingRingProps {
  fitting: Fitting;
  stats: FittingStats | null;
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
   * The phone overview (scope decision `20260924-205720`): no corner
   * readouts, tiles only explain themselves (a tap shows the tooltip), and
   * the rack buttons beneath open a rack's slots via `onRackOpen`.
   */
  compact?: boolean;
  onRackOpen?: (rack: FittingSlotKind) => void;
  /** The panel header's controls — the page's "+ Add module". */
  actions?: ReactNode;
}

function pct(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

/** Tick marks as one SVG path, `cx`/`cy` being the ring's centre in the box. */
function tickPath(angles: number[], cx: number, cy: number): string {
  return angles
    .map((angle) => {
      const a = ringPoint(angle, RING_TICK_INNER);
      const b = ringPoint(angle, RING_TICK_OUTER);
      return `M${(cx + a.x).toFixed(1)} ${(cy + a.y).toFixed(1)}L${(cx + b.x).toFixed(1)} ${(cy + b.y).toFixed(1)}`;
    })
    .join('');
}

function share(used: number | null, total: number | null): number {
  return used !== null && total !== null && total > 0 ? used / total : Number.NaN;
}

function RimGauge({
  gauge,
  used,
  total,
  overBudget,
  tone,
  cx,
  cy,
}: {
  gauge: { from: number; to: number; ticks: number };
  used: number | null;
  total: number | null;
  overBudget: boolean;
  tone: 'accent' | 'dim';
  cx: number;
  cy: number;
}) {
  const { filled, empty } = gaugeTicks(gauge.from, gauge.to, gauge.ticks, share(used, total));
  const fillClass = overBudget
    ? 'stroke-danger'
    : tone === 'accent'
      ? 'stroke-accent'
      : 'stroke-text-dim';
  return (
    <>
      <path d={tickPath(empty, cx, cy)} className="stroke-line" strokeWidth={2} />
      {filled.length > 0 && (
        <path d={tickPath(filled, cx, cy)} className={fillClass} strokeWidth={2} />
      )}
    </>
  );
}

function Readout({
  label,
  used,
  total,
  valueKey,
  flash,
  className,
}: {
  label: string;
  used: number | null;
  total: number | null;
  /** `{{used}} / {{total}}` with the resource's unit. */
  valueKey: string;
  flash: ReturnType<typeof useOverBudgetFlash>;
  className: string;
}) {
  const { t } = useTranslation();
  const known = used !== null && total !== null;
  const { overBudget, flashKey } = flash;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={known ? used : undefined}
      aria-valuemax={known ? total : undefined}
      className={`text-xs tabular-nums ${className}`}
    >
      <p className={MICRO_LABEL}>{label}</p>
      <p
        key={flashKey}
        className={`rounded-xs text-sm ${overBudget ? 'font-semibold text-danger' : 'text-text'} ${flashKey > 0 && overBudget ? 'flash-danger' : ''}`}
      >
        {known ? t(valueKey, { used: used.toFixed(1), total: total.toFixed(1) }) : '…'}
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
  const state = module ? t(`fittings.list.moduleState.${module.state}`) : '';
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

  const border = over
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

  return (
    <Tooltip content={tooltip} openOnTap={compact}>
      <button
        type="button"
        aria-label={label}
        className={`absolute border bg-bg ${border} ${interactive ? 'cursor-pointer hover:border-accent' : ''} ${draggable ? 'active:cursor-grabbing' : ''}`}
        style={{ ...position, transform: `rotate(${angle.toFixed(1)}deg)` }}
        onClick={interactive ? () => onSelect(slot.rack, slot.index) : undefined}
        draggable={draggable}
        onDragStart={
          draggable
            ? (event) =>
                startFittingDrag(event, { kind: 'slot', rack: slot.rack, index: slot.index })
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
              className={`h-[70%] w-[70%] ${module.state === 'offline' ? 'opacity-35 grayscale' : ''}`}
            />
          ) : (
            <AddRow aria-hidden className="text-text-dim" />
          )}
          {module?.chargeTypeId !== undefined && (
            <span className="absolute right-0 bottom-0 h-2/5 w-2/5 border border-line bg-panel">
              <TypeIcon typeId={module.chargeTypeId} size={32} className="h-full w-full" />
            </span>
          )}
          {cantUse && (
            <span className="absolute top-0 right-0 flex bg-danger text-bg">
              <Warn aria-hidden />
            </span>
          )}
        </span>
      </button>
    </Tooltip>
  );
}

/**
 * The game-style Ring view (scope decision `20260924-205720`): one band with
 * the hull's render filling the disc inside it, square tiles on the band —
 * highs across the top, mids down the right, lows along the bottom, rigs
 * upper-left, each rack filling clockwise, with the positions a hull lacks as
 * faint outlines — and CPU, powergrid, calibration and drone bandwidth as
 * tick gauges on the rim. Their numbers sit in the corners when the ring is
 * wide enough, else in a row beneath it. Subsystems (T3s) sit in a row below.
 *
 * Tiles take drops: an Add panel item on a slot of its rack, or a fitted
 * module dragged along its rack. The phone overview (`compact`) is read-only;
 * its rack buttons are the way in.
 */
export function FittingRing({
  fitting,
  stats,
  unusableModuleKeys,
  typeName,
  onSlotSelect,
  onDropType,
  onMoveModule,
  compact = false,
  onRackOpen,
  actions,
}: FittingRingProps) {
  const { t } = useTranslation();
  const layout = stats?.slotCounts ?? null;
  const slots = buildRingSlots(fitting, layout);

  const width = compact ? COMPACT_WIDTH : FULL_WIDTH;
  const cx = width / 2;
  const cy = HEIGHT / 2;

  const cpuUsed = stats?.cpuUsed ?? null;
  const cpuTotal = stats?.cpuTotal ?? null;
  const pgUsed = stats?.powergridUsed ?? null;
  const pgTotal = stats?.powergridTotal ?? null;
  const calUsed = stats?.calibrationUsed ?? null;
  const calTotal = stats?.calibrationTotal ?? null;
  const bwUsed = stats?.droneBandwidthUsed ?? null;
  const bwTotal = stats?.droneBandwidthTotal ?? null;
  const cpu = useOverBudgetFlash(cpuUsed, cpuTotal);
  const pg = useOverBudgetFlash(pgUsed, pgTotal);
  const cal = useOverBudgetFlash(calUsed, calTotal);
  const bw = useOverBudgetFlash(bwUsed, bwTotal);
  // A hull with no drone bay (a Corax) has no bandwidth gauge or readout.
  const dronesShown = showsDrones(stats, fitting.drones.length);

  const cantUse = (slot: RingSlot) =>
    slot.module !== undefined && (unusableModuleKeys?.has(moduleKey(slot.module)) ?? false);

  function tilePosition(angle: number): CSSProperties {
    const p = ringPoint(angle, RING_SLOT_RADIUS);
    return {
      left: pct(cx + p.x - RING_TILE / 2, width),
      top: pct(cy + p.y - RING_TILE / 2, HEIGHT),
      width: pct(RING_TILE, width),
      height: pct(RING_TILE, HEIGHT),
    };
  }

  const ringSlots = slots.filter((slot): slot is RingSlot & { rack: RingRack } =>
    RING_RACKS.includes(slot.rack as RingRack)
  );
  const subsystems = slots.filter((slot) => slot.rack === 'subsystem');
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
  // Corner readouts only once the ring is wide enough (650px) that they clear
  // the rim. Tailwind only sees whole class names in source, so the
  // `@min-[40.625rem]:` prefix is spelled out on each class, not composed.
  const corner = '@min-[40.625rem]:absolute';

  return (
    <Panel title={t('fittings.ring.title')} actions={actions}>
      <div className="@container space-y-3">
        <div className="relative">
          <div
            className="relative mx-auto w-full"
            style={{ aspectRatio: `${width} / ${HEIGHT}`, maxWidth: width }}
          >
            <div
              className="absolute overflow-hidden rounded-full bg-bg"
              style={{
                left: pct(cx - disc, width),
                top: pct(cy - disc, HEIGHT),
                width: pct(disc * 2, width),
                height: pct(disc * 2, HEIGHT),
              }}
            >
              <ShipRender typeId={fitting.shipTypeId} />
            </div>
            <svg
              viewBox={`0 0 ${width} ${HEIGHT}`}
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              <circle
                cx={cx}
                cy={cy}
                r={RING_SLOT_RADIUS}
                className="fill-none stroke-bg"
                strokeWidth={RING_OUTER_RADIUS - RING_INNER_RADIUS}
              />
              <circle cx={cx} cy={cy} r={RING_OUTER_RADIUS} className="fill-none stroke-line" />
              <circle cx={cx} cy={cy} r={RING_INNER_RADIUS} className="fill-none stroke-line" />
              <RimGauge
                gauge={GAUGES.calibration}
                used={calUsed}
                total={calTotal}
                overBudget={cal.overBudget}
                tone="dim"
                cx={cx}
                cy={cy}
              />
              {dronesShown && (
                <RimGauge
                  gauge={GAUGES.droneBandwidth}
                  used={bwUsed}
                  total={bwTotal}
                  overBudget={bw.overBudget}
                  tone="dim"
                  cx={cx}
                  cy={cy}
                />
              )}
              <RimGauge
                gauge={GAUGES.cpu}
                used={cpuUsed}
                total={cpuTotal}
                overBudget={cpu.overBudget}
                tone="accent"
                cx={cx}
                cy={cy}
              />
              <RimGauge
                gauge={GAUGES.powergrid}
                used={pgUsed}
                total={pgTotal}
                overBudget={pg.overBudget}
                tone="accent"
                cx={cx}
                cy={cy}
              />
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
                  position={tilePosition(angle)}
                  angle={angle}
                />
              );
            })}
          </div>

          {!compact && (
            <div
              className={`mt-3 grid grid-cols-2 gap-3 @min-[40.625rem]:pointer-events-none @min-[40.625rem]:absolute @min-[40.625rem]:inset-0 @min-[40.625rem]:m-0 @min-[40.625rem]:block`}
            >
              <Readout
                label={t('fittings.list.calibration')}
                used={calUsed}
                total={calTotal}
                valueKey="fittings.ring.readoutCalibration"
                flash={cal}
                className={`${corner} @min-[40.625rem]:top-0 @min-[40.625rem]:left-0`}
              />
              {dronesShown && (
                <Readout
                  label={t('fittings.list.droneBandwidth')}
                  used={bwUsed}
                  total={bwTotal}
                  valueKey="fittings.ring.readoutDroneBandwidth"
                  flash={bw}
                  className={`${corner} @min-[40.625rem]:top-0 @min-[40.625rem]:right-0 @min-[40.625rem]:text-right`}
                />
              )}
              {/* `contents` keeps the two as grid cells when narrow; wide, they stack in the corner. */}
              <div
                className={`contents ${corner} @min-[40.625rem]:right-0 @min-[40.625rem]:bottom-0 @min-[40.625rem]:flex @min-[40.625rem]:flex-col @min-[40.625rem]:gap-1 @min-[40.625rem]:text-right`}
              >
                <Readout
                  label={t('fittings.list.cpu')}
                  used={cpuUsed}
                  total={cpuTotal}
                  valueKey="fittings.ring.readoutCpu"
                  flash={cpu}
                  className=""
                />
                <Readout
                  label={t('fittings.list.powergrid')}
                  used={pgUsed}
                  total={pgTotal}
                  valueKey="fittings.ring.readoutPowergrid"
                  flash={pg}
                  className=""
                />
              </div>
            </div>
          )}
        </div>

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
                    position={{ inset: 0 }}
                    angle={0}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
