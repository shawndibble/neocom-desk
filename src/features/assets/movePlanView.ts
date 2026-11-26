import type { Haul } from '@/engine/assets/movePlan';
import type { PickerStack } from './movePlanInput';

const PICKUP_HUE_VARS = [
  'var(--color-pickup-1)',
  'var(--color-pickup-2)',
  'var(--color-pickup-3)',
  'var(--color-pickup-4)',
] as const;
export const PICKUP_HUE_COUNT = PICKUP_HUE_VARS.length;

export function pickupHues(locationIds: readonly number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of locationIds) if (!out.has(id)) out.set(id, out.size % PICKUP_HUE_COUNT);
  return out;
}

export const pickupHueVar = (hue: number) => PICKUP_HUE_VARS[hue % PICKUP_HUE_COUNT];

export interface SplitSegment {
  key: number;
  m3: number;
  share: number;
}

export function splitSegments(parts: readonly { key: number; m3: number }[]): SplitSegment[] {
  const total = parts.reduce((s, p) => s + p.m3, 0);
  if (total <= 0) return [];
  return parts.filter((p) => p.m3 > 0).map((p) => ({ ...p, share: p.m3 / total }));
}

export interface HaulRun {
  from: number;
  to: number;
  haul: Haul;
}

const haulSignature = (haul: Haul) =>
  haul.holds
    .map((h) => `${h.kind}:${h.lines.map((l) => `${l.typeId}x${l.quantity}`).join(',')}`)
    .join('|');

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
  m3: number;
  byLocation: Map<number, number>;
}

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

export function shortStationLabels(names: readonly string[]): string[] {
  const head = (n: string) => n.split(' - ')[0];
  const counts = new Map<string, number>();
  for (const n of names) counts.set(head(n), (counts.get(head(n)) ?? 0) + 1);
  return names.map((n) => ((counts.get(head(n)) ?? 0) > 1 ? n : head(n)));
}
