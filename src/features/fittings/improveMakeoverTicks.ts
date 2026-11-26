import { iskDeltaOf, type ImproveOption } from '@/engine/fittings/improve';
import { moveKey, optionKey, toggleTick } from '@/engine/fittings/improve';
import type { Makeover } from '@/engine/fittings/improve';

export type GroupTick = 'all' | 'some' | 'none';

export function groupTick(keys: readonly string[], ticked: ReadonlySet<string>): GroupTick {
  const count = keys.filter((key) => ticked.has(key)).length;
  if (count === 0) return 'none';
  return count === keys.length ? 'all' : 'some';
}

export function groupToggleTarget(state: GroupTick): boolean {
  return state !== 'all';
}

export const showsOwnGain = (state: GroupTick): boolean => state === 'some';

export function makeoverOptionsOf(
  makeover: Makeover,
  priceOf: (typeId: number) => number | null
): ImproveOption[] {
  return makeover.rows.map((candidate) => ({
    candidate,
    fitting: makeover.fitting,
    after: makeover.after,
    score: makeover.score,
    iskDelta: iskDeltaOf(candidate, priceOf),
    lost: [],
  }));
}

export function singleGainsOf(
  rows: readonly ImproveOption['candidate'][],
  singles: readonly ImproveOption[]
): Map<string, number> {
  const scored = new Map<string, number>();
  for (const single of singles) {
    const key = `${optionKey(single)}#${single.candidate.at.length}`;
    if (!scored.has(key)) scored.set(key, single.score);
  }
  const gains = new Map<string, number>();
  for (const row of rows) {
    const key = moveKey(row);
    const score = scored.get(`${key}#${row.at.length}`);
    if (score !== undefined) gains.set(key, score);
  }
  return gains;
}

export function tickMakeoverRows(
  ticked: ReadonlyMap<string, ImproveOption>,
  replaced: ReadonlyMap<string, string>,
  rows: readonly ImproveOption[],
  checked: boolean,
  labelOf: (option: ImproveOption) => string
): { byModule: Map<string, ImproveOption>; replaced: Map<string, string> } {
  let state = { byModule: new Map(ticked), replaced: new Map(replaced) };
  for (const row of rows) {
    const key = optionKey(row);
    const on = state.byModule.has(key);
    if (checked === on) continue;
    state = toggleTick(state.byModule, state.replaced, row, labelOf);
  }
  return state;
}
