/**
 * The destinations Route Safety offers one tap away before a route exists:
 * the trade hubs, then the nearest Incursion's staging system. Each is a
 * place to go, never a verdict on it.
 */
export interface QuickPick {
  kind: 'hub' | 'incursion';
  systemId: number;
  name: string;
}

interface NamedSystem {
  systemId: number;
  name: string;
}

export function quickPicks({
  hubs,
  incursion,
  taken,
}: {
  hubs: readonly NamedSystem[];
  /** The nearest Incursion's staging system, or `null` when none is nearby. */
  incursion: NamedSystem | null;
  /** The trip's From and Stops: already on it, so nothing to offer. */
  taken: ReadonlySet<number>;
}): QuickPick[] {
  const picks: QuickPick[] = hubs
    .filter((hub) => !taken.has(hub.systemId))
    .map((hub) => ({ kind: 'hub', ...hub }));
  if (
    incursion !== null &&
    !taken.has(incursion.systemId) &&
    !picks.some((pick) => pick.systemId === incursion.systemId)
  ) {
    picks.push({ kind: 'incursion', ...incursion });
  }
  return picks;
}
