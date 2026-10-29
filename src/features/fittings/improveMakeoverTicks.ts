import { iskDeltaOf, type ImproveOption } from '@/engine/fittings/improve';
import { optionKey, toggleTick } from '@/engine/fittings/improveKeys';
import type { Makeover } from '@/engine/fittings/improveMakeover';

/**
 * The Makeover group's tick logic: which of the group's rows are ticked, the
 * group's three states, and when a row shows its own gain. Pure.
 */
export type GroupTick = 'all' | 'some' | 'none';

/** The group's tick: all rows ticked, none, or some (the dash). */
export function groupTick(keys: readonly string[], ticked: ReadonlySet<string>): GroupTick {
  const count = keys.filter((key) => ticked.has(key)).length;
  if (count === 0) return 'none';
  return count === keys.length ? 'all' : 'some';
}

/** What a click on the group's tick asks for: all rows on, unless every row already is. */
export function groupToggleTarget(state: GroupTick): boolean {
  return state !== 'all';
}

/**
 * A row's "on its own" gain is a guide to which rows carry the Makeover. With the
 * whole group ticked it would read as a part of the group's total, so it shows
 * only while the group is partly ticked.
 */
export const showsOwnGain = (state: GroupTick): boolean => state === 'some';

/**
 * The Makeover's rows as Improve options, so a ticked row joins the one set
 * Improve checks and applies. A row's own `fitting`, `after` and `score` are the
 * whole Makeover's (a row has no figure alone: that is `singleGainsOf`'s guide);
 * what the set shows comes from recalculating the ticked rows together.
 */
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

/**
 * Each row's gain on its own: that of the same swap in Improve's single-swap
 * results (same key, same copies). A row never scored alone has none; nothing
 * is searched to fill it.
 */
export function singleGainsOf(
  rows: readonly ImproveOption['candidate'][],
  singles: readonly ImproveOption[]
): Map<string, number> {
  const gains = new Map<string, number>();
  for (const row of rows) {
    const key = optionKey({ candidate: row } as ImproveOption);
    const same = singles.find(
      (single) => optionKey(single) === key && single.candidate.at.length === row.at.length
    );
    if (same) gains.set(key, same.score);
  }
  return gains;
}

/**
 * Ticks or unticks `rows` (the group's rows given). Ticking a row displaces any
 * pick sharing one of its slots, a single swap included (`toggleTick`'s rule: the
 * latest tick wins, and the displaced pick's label is remembered); unticking just
 * removes them.
 */
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
