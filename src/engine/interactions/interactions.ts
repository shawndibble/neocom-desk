/**
 * Show Info › Interactions: what a pilot (or a corporation's book) has done with
 * another player. Pure: the sources in `features/interactions` turn wallet,
 * contract, mail, killmail and corp-book records into `Interaction`s, and this
 * module orders and groups them for the tab.
 */

export type InteractionKind = 'wallet' | 'contract' | 'mail' | 'kill' | 'book';

export type InteractionTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface Interaction {
  /** Unique across kinds and sources, e.g. `wallet-<characterId>-<refId>`. */
  id: string;
  kind: InteractionKind;
  /** Epoch ms. */
  at: number;
  /** i18n key of the pill (`interactions.type.*`). */
  type: string;
  tone: InteractionTone;
  /** One line, already translated. */
  title: string;
  /** Second line, already translated. */
  detail?: string;
  /** Signed ISK from the viewer's side; absent when no money moved. */
  isk?: number;
  /** i18n key of the state pill (`interactions.state.*`). */
  state?: string;
  stateTone?: InteractionTone;
  /** Which of the viewer's Characters it happened to (personal scopes). */
  characterId?: number;
  /** Where a click on the row goes: a same-app path with its search. */
  to: string;
}

export interface MonthGroup {
  /** `YYYY-MM`, UTC. */
  month: string;
  items: Interaction[];
  /** Sum of the rows' ISK. */
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
