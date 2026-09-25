/**
 * Geometry and slot filling for the Ring view (issue #1536). Pure: the ring's
 * components turn these numbers into SVG and absolutely-positioned buttons.
 * Coordinates are percentages of a square, centre at (50, 50).
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

/** Degrees clockwise from 12 o'clock at which each ring rack is centred. */
const RACK_CENTRE_DEG: Partial<Record<FittingSlotKind, number>> = {
  high: 0,
  medium: 90,
  low: 180,
  rig: 270,
};

const RING_RADIUS = 42;
/** Inward step for every other slot of a crowded rack, so 44px targets never overlap. */
const ZIGZAG_INSET = 13;
const RACK_SPAN_DEG = 70;
const MAX_STEP_DEG = 26;
const ZIGZAG_FROM = 5;

/** Where slot `index` of `count` in a ring rack sits. Subsystems aren't on the ring. */
export function ringSlotPosition(
  rack: FittingSlotKind,
  index: number,
  count: number
): { x: number; y: number } {
  const centre = RACK_CENTRE_DEG[rack] ?? 0;
  const step = count > 1 ? Math.min(MAX_STEP_DEG, RACK_SPAN_DEG / (count - 1)) : 0;
  const deg = centre + (index - (count - 1) / 2) * step;
  const radius = count >= ZIGZAG_FROM && index % 2 === 1 ? RING_RADIUS - ZIGZAG_INSET : RING_RADIUS;
  const rad = (deg * Math.PI) / 180;
  return { x: 50 + radius * Math.sin(rad), y: 50 - radius * Math.cos(rad) };
}

/**
 * The point `fraction` (0-1) of the way down a half-circle gauge from the top:
 * the left half for CPU, the right half for powergrid.
 */
export function arcEndPoint(
  side: 'left' | 'right',
  fraction: number,
  radius: number
): { x: number; y: number } {
  const theta = Math.min(1, Math.max(0, fraction)) * Math.PI;
  const dx = radius * Math.sin(theta);
  return { x: side === 'left' ? 50 - dx : 50 + dx, y: 50 - radius * Math.cos(theta) };
}
