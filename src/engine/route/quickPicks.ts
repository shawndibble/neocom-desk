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
  incursion: NamedSystem | null;
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
