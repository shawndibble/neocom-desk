import type { Haul } from '@/engine/assets/movePlan';
import type { PickerStack } from './movePlanInput';

/**
 * `--color-pickup-1` … `-4` in index.css. Written out in full rather than
 * built from the slot number: Tailwind only emits a theme variable whose name
 * it finds in the source, and a template string hides it.
 */
const PICKUP_HUE_VARS = [
  'var(--color-pickup-1)',
  'var(--color-pickup-2)',
  'var(--color-pickup-3)',
  'var(--color-pickup-4)',
] as const;
export const PICKUP_HUE_COUNT = PICKUP_HUE_VARS.length;

/** Palette slot per pickup location, in first-seen order, so a location keeps its colour from picker to plan. */
export function pickupHues(locationIds: readonly number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of locationIds) if (!out.has(id)) out.set(id, out.size % PICKUP_HUE_COUNT);
  return out;
}

export const pickupHueVar = (hue: number) => PICKUP_HUE_VARS[hue % PICKUP_HUE_COUNT];

export interface SplitSegment {
  key: number;
  m3: number;
  /** 0–1 of the total. */
  share: number;
}

/** The parts' share of their total; parts with no volume are dropped. */
export function splitSegments(parts: readonly { key: number; m3: number }[]): SplitSegment[] {
  const total = parts.reduce((s, p) => s + p.m3, 0);
  if (total <= 0) return [];
  return parts.filter((p) => p.m3 > 0).map((p) => ({ ...p, share: p.m3 / total }));
}

export interface HaulRun {
  /** 1-based first and last haul of a run of identical loads. */
  from: number;
  to: number;
  haul: Haul;
}

const haulSignature = (haul: Haul) =>
  haul.holds
    .map((h) => `${h.kind}:${h.lines.map((l) => `${l.typeId}x${l.quantity}`).join(',')}`)
    .join('|');

/** Neighbouring hauls carrying the exact same load folded into one range, so nine full holds read as one entry. */
export function foldHauls(hauls: readonly Haul[]): HaulRun[] {
  const runs: HaulRun[] = [];
  hauls.forEach((haul, i) => {
    const last = runs[runs.length - 1];
    if (last && haulSignature(last.haul) === haulSignature(haul)) last.to = i + 1;
    else runs.push({ from: i + 1, to: i + 1, haul });
  });
  return runs;
}

export interface PickedTotals {
  stacks: number;
  ships: number;
  /** Known packaged volume of the picked stacks. */
  m3: number;
  byLocation: Map<number, number>;
}

/** A location's stacks, biggest packaged haul first, then by item name. */
export function sortStacksByVolume(
  stacks: readonly PickerStack[],
  unitM3: ReadonlyMap<number, number>,
  typeName: (typeId: number) => string
): PickerStack[] {
  const m3 = (s: PickerStack) => s.quantity * (unitM3.get(s.typeId) ?? 0);
  return [...stacks].sort(
    (a, b) => m3(b) - m3(a) || typeName(a.typeId).localeCompare(typeName(b.typeId))
  );
}

/** What the picker's footer shows: ticks at a destination location do not count. */
export function pickedTotals(
  stacks: readonly PickerStack[],
  selected: ReadonlySet<string>,
  unitM3: ReadonlyMap<number, number>,
  atDestination: ReadonlySet<number>
): PickedTotals {
  const out: PickedTotals = { stacks: 0, ships: 0, m3: 0, byLocation: new Map() };
  for (const s of stacks) {
    if (!selected.has(s.key) || atDestination.has(s.locationId)) continue;
    if (s.ship) {
      out.ships += 1;
      continue;
    }
    out.stacks += 1;
    const m3 = s.quantity * (unitM3.get(s.typeId) ?? 0);
    out.m3 += m3;
    out.byLocation.set(s.locationId, (out.byLocation.get(s.locationId) ?? 0) + m3);
  }
  return out;
}

/**
 * A station's short name for a chip: the part before the first " - " (the
 * system, with the station number), or the full name when two stations share
 * that part and would read the same.
 */
export function shortStationLabels(names: readonly string[]): string[] {
  const head = (n: string) => n.split(' - ')[0];
  const counts = new Map<string, number>();
  for (const n of names) counts.set(head(n), (counts.get(head(n)) ?? 0) + 1);
  return names.map((n) => ((counts.get(head(n)) ?? 0) > 1 ? n : head(n)));
}
