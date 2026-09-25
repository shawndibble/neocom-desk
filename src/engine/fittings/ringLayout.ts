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

/** The band's outer and inner edges; tiles centre on the band. */
export const RING_OUTER_RADIUS = 300;
export const RING_INNER_RADIUS = 262;
export const RING_SLOT_RADIUS = (RING_OUTER_RADIUS + RING_INNER_RADIUS) / 2;
/** A slot tile's side. */
export const RING_TILE = 44;
/** Gauge ticks run on the rim, just outside the band. */
export const RING_TICK_INNER = 305;
export const RING_TICK_OUTER = 315;

/** Angle between neighbouring tiles of one rack: a tile plus a small gap at the slot radius. */
const PITCH_DEG = 10.2;

/** Where each rack's positions are centred — matching the game window. */
const RACK_CENTRE_DEG: Readonly<Record<RingRack, number>> = {
  high: -8,
  medium: 88,
  low: 182,
  rig: -79,
};

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
 * A rim gauge's `count` tick angles from `from` to `to`, split into the ones
 * the used `fraction` fills (from the first tick) and the rest. Over budget
 * fills them all; an unknown share (NaN) fills none.
 */
export function gaugeTicks(
  from: number,
  to: number,
  count: number,
  fraction: number
): { filled: number[]; empty: number[] } {
  const share = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const filledCount = Math.round(share * count);
  const filled: number[] = [];
  const empty: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = count > 1 ? from + ((to - from) * i) / (count - 1) : from;
    (i < filledCount ? filled : empty).push(angle);
  }
  return { filled, empty };
}
