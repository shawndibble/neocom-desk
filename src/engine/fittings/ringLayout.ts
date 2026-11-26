import {
  FITTING_SLOT_KINDS,
  type Fitting,
  type FittingModule,
  type FittingSlotKind,
} from './types';
import type { HardpointKind } from './hardpoints';

export interface RingSlot {
  rack: FittingSlotKind;
  index: number;
  module?: FittingModule;
}

export type SlotLayout = Record<FittingSlotKind, number>;

export type RingRack = 'high' | 'medium' | 'low' | 'rig';

export const RING_RACKS: readonly RingRack[] = ['high', 'medium', 'low', 'rig'];

export const RING_POSITIONS: Readonly<Record<RingRack, number>> = {
  high: 8,
  medium: 8,
  low: 8,
  rig: 3,
};

export const RING_VIEW = 648;
export const RING_OUTER_RADIUS = 300;
export const RING_INNER_RADIUS = 240;
export const RING_SLOT_RADIUS = (RING_OUTER_RADIUS + RING_INNER_RADIUS) / 2;
export const RING_TILE = 48;
export const RING_GAUGE_RADIUS = 312;

const PITCH_DEG = 12;

const RACK_CENTRE_DEG: Readonly<Record<RingRack, number>> = {
  high: -15,
  medium: 90,
  low: 195,
  rig: -90,
};

export const RING_GAUGES = {
  cpu: { from: 172, to: 100 },
  powergrid: { from: 188, to: 260 },
  calibration: { from: -80, to: -30 },
  droneBandwidth: { from: 30, to: 80 },
} as const;

export type RingGauge = keyof typeof RING_GAUGES;

const PIP_PITCH_DEG = 3;
const PIP_START_DEG = 7.5;
const GLYPH_DEG = 3.5;

export function hardpointPipAngles(kind: HardpointKind, count: number): number[] {
  const side = kind === 'turret' ? -1 : 1;
  return Array.from(
    { length: count },
    (_, index) => side * (PIP_START_DEG + index * PIP_PITCH_DEG)
  );
}

export function hardpointGlyphAngle(kind: HardpointKind): number {
  return kind === 'turret' ? -GLYPH_DEG : GLYPH_DEG;
}

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

export function ringSlotAngle(rack: RingRack, index: number): number {
  const first = RACK_CENTRE_DEG[rack] - ((RING_POSITIONS[rack] - 1) / 2) * PITCH_DEG;
  return first + index * PITCH_DEG;
}

const SUBSYSTEM_RING_ORDER: readonly FittingSlotKind[] = [
  'rig',
  'subsystem',
  'high',
  'medium',
  'low',
];
const SUBSYSTEM_GAP_DEG = 2 * PITCH_DEG;
const MIN_GAP_DEG =
  RACK_CENTRE_DEG.medium -
  ((RING_POSITIONS.medium - 1) / 2) * PITCH_DEG -
  (RACK_CENTRE_DEG.high + ((RING_POSITIONS.high - 1) / 2) * PITCH_DEG);
const MIN_PITCH_DEG =
  (2 * Math.asin(RING_TILE / 2 / (RING_SLOT_RADIUS - RING_TILE / 2)) * 180) / Math.PI;

export function ringSlotAngles(counts: SlotLayout): Record<FittingSlotKind, number[]> {
  const angles = Object.fromEntries(
    FITTING_SLOT_KINDS.map((rack) => [rack, [] as number[]])
  ) as Record<FittingSlotKind, number[]>;
  if (counts.subsystem <= 0) {
    for (const rack of RING_RACKS) {
      angles[rack] = Array.from({ length: counts[rack] }, (_, index) => ringSlotAngle(rack, index));
    }
    return angles;
  }

  const racks = SUBSYSTEM_RING_ORDER.filter((rack) => counts[rack] > 0);
  const tiles = racks.reduce((sum, rack) => sum + counts[rack], 0);
  const inRack = tiles - racks.length;
  let pitch = PITCH_DEG;
  let gap = Math.min(SUBSYSTEM_GAP_DEG, (360 - inRack * pitch) / racks.length);
  if (gap < MIN_GAP_DEG) {
    gap = MIN_GAP_DEG;
    pitch = (360 - racks.length * gap) / inRack;
    if (pitch < MIN_PITCH_DEG) {
      pitch = MIN_PITCH_DEG;
      gap = (360 - inRack * pitch) / racks.length;
      if (gap < pitch) pitch = gap = 360 / tiles;
    }
  }

  let at = 0;
  for (const rack of racks) {
    for (let index = 0; index < counts[rack]; index++) {
      angles[rack].push(at);
      at += index < counts[rack] - 1 ? pitch : gap;
    }
  }
  const anchor = counts.high > 0 ? 'high' : 'subsystem';
  const anchorList = angles[anchor];
  const centre = (anchorList[0] + anchorList[anchorList.length - 1]) / 2;
  const LEFT = -90;
  const turn = (anchor === 'high' ? RACK_CENTRE_DEG.high : LEFT) - centre;
  for (const rack of racks) {
    angles[rack] = angles[rack].map((angle) => angle + turn);
  }
  return angles;
}

export function ringGhostIndices(rack: RingRack, slotCount: number): number[] {
  const ghosts: number[] = [];
  for (let index = Math.max(0, slotCount); index < RING_POSITIONS[rack]; index++) {
    ghosts.push(index);
  }
  return ghosts;
}

export function ringPoint(angle: number, radius: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: radius * Math.sin(rad), y: -radius * Math.cos(rad) };
}

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
  return (Math.abs(value) < 0.05 ? 0 : value).toFixed(1);
}

export function arcPath(from: number, to: number, radius: number, cx: number, cy: number): string {
  const a = ringPoint(from, radius);
  const b = ringPoint(to, radius);
  const largeArc = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M${coordinate(cx + a.x)} ${coordinate(cy + a.y)}A${radius} ${radius} 0 ${largeArc} ${sweep} ${coordinate(cx + b.x)} ${coordinate(cy + b.y)}`;
}
