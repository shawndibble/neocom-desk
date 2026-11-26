export interface RenderedFire<TFire> {
  fire: TFire;
  title: string;
  body: string;
}

export interface FireGroup<TFire> {
  fire: TFire;
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
