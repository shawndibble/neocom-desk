/**
 * Geometry and slot filling for the Ring view — the game's fitting window
 * (and EVE Workbench's radial) redrawn: one band, square tiles on it, each
 * rack filling clockwise from its first position. Pure: the ring component
 * turns these numbers into SVG and absolutely-positioned buttons.
 *
 * Angles are degrees clockwise from 12 o'clock; points and lengths are ring
 * units measured from the ring's centre, in the same space as the band radii
 * below (the component draws them at 1 unit = 1px at full size and scales).
 */
import {
  FITTING_SLOT_KINDS,
  type Fitting,
  type FittingModule,
  type FittingSlotKind,
} from './types';

export interface RingSlot {
  rack: FittingSlotKind;
  index: number;
  /** Absent for an empty slot. */
  module?: FittingModule;
}

export type SlotLayout = Record<FittingSlotKind, number>;

/** The racks drawn on the ring; subsystems sit in a row beneath it. */
export type RingRack = 'high' | 'medium' | 'low' | 'rig';

export const RING_RACKS: readonly RingRack[] = ['high', 'medium', 'low', 'rig'];

/** Every position a rack draws — the most slots any hull has in it. */
export const RING_POSITIONS: Readonly<Record<RingRack, number>> = {
  high: 8,
  medium: 8,
  low: 8,
  rig: 3,
};

/** The square box the ring is drawn in, ring units; its centre is the ring's. */
export const RING_VIEW = 648;
/** The band's outer and inner edges; tiles centre on the band. */
export const RING_OUTER_RADIUS = 300;
export const RING_INNER_RADIUS = 240;
export const RING_SLOT_RADIUS = (RING_OUTER_RADIUS + RING_INNER_RADIUS) / 2;
/** A slot tile's side. */
export const RING_TILE = 48;
/** The resource gauges run on the rim, just outside the band. */
export const RING_GAUGE_RADIUS = 312;

/** Angle between neighbouring tiles of one rack: a tile plus a small gap at the slot radius. */
const PITCH_DEG = 12;

/**
 * Where each rack's positions are centred — the game window's order, turned
 * a little anticlockwise as it is: highs from ten o'clock over the top, mids
 * down the right, lows round the bottom, rigs on the left. The four sit an
 * even ~11° apart.
 */
const RACK_CENTRE_DEG: Readonly<Record<RingRack, number>> = {
  high: -15,
  medium: 90,
  low: 195,
  rig: -90,
};

/**
 * The rim gauges, degrees clockwise from 12 o'clock, each filling from `from`
 * towards `to`. CPU and powergrid — the two a fit most often runs out of —
 * rise either side of the bottom, apart, so neither reads as the other;
 * calibration sits by the rigs that draw it, drone bandwidth opposite.
 */
export const RING_GAUGES = {
  cpu: { from: 172, to: 100 },
  powergrid: { from: 188, to: 260 },
  calibration: { from: -80, to: -30 },
  droneBandwidth: { from: 30, to: 80 },
} as const;

export type RingGauge = keyof typeof RING_GAUGES;

/** Degrees between neighbouring hardpoint pips, and from 12 o'clock to the first. */
const PIP_PITCH_DEG = 3.5;
const PIP_START_DEG = 4;

/**
 * Where a hull's hardpoint pips sit on the rim's top gap, between the
 * calibration and drone bandwidth bands: turrets running out left from
 * 12 o'clock, launchers out right, the first of each nearest the top.
 */
export function hardpointPipAngles(kind: 'turret' | 'launcher', count: number): number[] {
  const side = kind === 'turret' ? -1 : 1;
  return Array.from(
    { length: count },
    (_, index) => side * (PIP_START_DEG + index * PIP_PITCH_DEG)
  );
}

/**
 * Every slot each rack has, fitted or not. `layout` is the hull's slot counts
 * (`null` until the stats load), in which case only slots up to the highest
 * fitted one show. A module past the layout's count is never dropped.
 */
export function buildRingSlots(fitting: Fitting, layout: SlotLayout | null): RingSlot[] {
  const slots: RingSlot[] = [];
  for (const rack of FITTING_SLOT_KINDS) {
    const fitted = new Map<number, FittingModule>();
    for (const module of fitting.modules) {
      if (module.slot === rack) fitted.set(module.slotIndex, module);
    }
    const highest = Math.max(-1, ...fitted.keys());
    const count = Math.max(layout?.[rack] ?? 0, highest + 1);
    for (let index = 0; index < count; index++) {
      slots.push({ rack, index, module: fitted.get(index) });
    }
  }
  return slots;
}

/** The angle slot `index` of a ring rack sits at. */
export function ringSlotAngle(rack: RingRack, index: number): number {
  const first = RACK_CENTRE_DEG[rack] - ((RING_POSITIONS[rack] - 1) / 2) * PITCH_DEG;
  return first + index * PITCH_DEG;
}

/** The positions a rack draws beyond a hull's `slotCount` slots — the faint outlines. */
export function ringGhostIndices(rack: RingRack, slotCount: number): number[] {
  const ghosts: number[] = [];
  for (let index = Math.max(0, slotCount); index < RING_POSITIONS[rack]; index++) {
    ghosts.push(index);
  }
  return ghosts;
}

/** The point `radius` out from the centre at `angle`. */
export function ringPoint(angle: number, radius: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: radius * Math.sin(rad), y: -radius * Math.cos(rad) };
}

/**
 * A rim gauge from `from` to `to`, split at the used `fraction` into the
 * filled stretch (from `from`) and the empty rest, each `[start, end]` or
 * null when there is none. Over budget fills it all; an unknown share (NaN)
 * fills none.
 */
export function gaugeArc(
  from: number,
  to: number,
  fraction: number
): { filled: [number, number] | null; empty: [number, number] | null } {
  const share = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const split = from + (to - from) * share;
  return {
    filled: share > 0 ? [from, split] : null,
    empty: share < 1 ? [split, to] : null,
  };
}

function coordinate(value: number): string {
  // No "-0.0" from a sine that is zero bar rounding.
  return (Math.abs(value) < 0.05 ? 0 : value).toFixed(1);
}

/**
 * An SVG path along the circle of `radius` about (`cx`, `cy`) from angle
 * `from` to `to` — clockwise when `to` is the larger, anticlockwise otherwise.
 */
export function arcPath(from: number, to: number, radius: number, cx: number, cy: number): string {
  const a = ringPoint(from, radius);
  const b = ringPoint(to, radius);
  const largeArc = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M${coordinate(cx + a.x)} ${coordinate(cy + a.y)}A${radius} ${radius} 0 ${largeArc} ${sweep} ${coordinate(cx + b.x)} ${coordinate(cy + b.y)}`;
}
