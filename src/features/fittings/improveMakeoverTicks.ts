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
