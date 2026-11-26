export type InteractionKind = 'wallet' | 'contract' | 'mail' | 'kill' | 'book';

export type InteractionTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface Interaction {
  id: string;
  kind: InteractionKind;
  at: number;
  type: string;
  tone: InteractionTone;
  title: string;
  detail?: string;
  isk?: number;
  state?: string;
  stateTone?: InteractionTone;
  characterId?: number;
  to: string;
}

export interface MonthGroup {
  month: string;
  items: Interaction[];
  net: number;
}

export function newestFirst(items: readonly Interaction[]): Interaction[] {
  return [...items].sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function groupByMonth(items: readonly Interaction[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const item of newestFirst(items)) {
    const month = new Date(item.at).toISOString().slice(0, 7);
    let group = groups.get(month);
    if (!group) {
      group = { month, items: [], net: 0 };
      groups.set(month, group);
    }
    group.items.push(item);
    group.net += item.isk ?? 0;
  }
  return [...groups.values()];
}

export function kindCounts(
  items: readonly Interaction[]
): Partial<Record<InteractionKind, number>> {
  const counts: Partial<Record<InteractionKind, number>> = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  return counts;
}
