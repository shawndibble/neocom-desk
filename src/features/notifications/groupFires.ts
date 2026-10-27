/**
 * Collapses fires that render identical notification copy into one entry
 * carrying a `count`, so a burst of near-simultaneous fires that all say the
 * same thing (three market orders filling in one poll, none of which name
 * which order) reaches the reader as one "Market order filled x3" instead of
 * three back-to-back near-duplicate browser toasts and feed rows.
 *
 * Grouped on rendered `title`+`body`, not on the fire's own fields: a fire's
 * identifying data (an order id, a mail id) is often not part of the copy at
 * all, so two fires that differ only in that field are indistinguishable to
 * the reader and are exactly what this collapses. A fire whose copy *does*
 * differ (two different skills completing) stays its own entry -- collapsing
 * it would silently drop information the copy is the only place it appears.
 * `eventId` is part of the key too, purely as a safety margin against two
 * unrelated events ever rendering the same copy by coincidence.
 */
export interface RenderedFire<TFire> {
  fire: TFire;
  title: string;
  body: string;
}

export interface FireGroup<TFire> {
  /** The first fire in the group -- what a caller needing "the" fire (its eventId, its identifying fields for a channel gate) should use. */
  fire: TFire;
  /**
   * Every fire in the group, in arrival order; `fire` is this list's first
   * element and `count` its length.
   *
   * The browser channel only ever needed the representative -- it raises one
   * toast and the others are discarded. The Notification Feed does not: it
   * stores a row per occurrence deliberately (see `foregroundPoller.ts`'s
   * "one row per actual occurrence, never grouped"), collapses them only for
   * display, and so has to reach every stored row behind a collapsed one to
   * dismiss it.
   */
  fires: TFire[];
  title: string;
  body: string;
  count: number;
}

function groupKey(eventId: string, title: string, body: string): string {
  return JSON.stringify([eventId, title, body]);
}

export function groupIdenticalFires<TFire extends { eventId: string }>(
  rendered: readonly RenderedFire<TFire>[]
): FireGroup<TFire>[] {
  const groups: FireGroup<TFire>[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of rendered) {
    const key = groupKey(item.fire.eventId, item.title, item.body);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({
        fire: item.fire,
        fires: [item.fire],
        title: item.title,
        body: item.body,
        count: 1,
      });
    } else {
      groups[existingIndex].fires.push(item.fire);
      groups[existingIndex].count += 1;
    }
  }
  return groups;
}
