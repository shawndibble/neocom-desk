export type StandingBand = 'red' | 'orange' | 'neutral' | 'blue';

export interface ContactStanding {
  band: StandingBand;
  value: number;
  via: 'character' | 'corporation' | 'alliance';
}

export function standingBand(value: number): StandingBand {
  if (value <= -7.5) return 'red';
  if (value < 0) return 'orange';
  if (value < 2.5) return 'neutral';
  return 'blue';
}

export function resolveStanding(
  contacts: ReadonlyMap<number, number>,
  ids: { characterId: number; corporationId: number | null; allianceId: number | null }
): ContactStanding | null {
  const chain: [number | null, ContactStanding['via']][] = [
    [ids.characterId, 'character'],
    [ids.corporationId, 'corporation'],
    [ids.allianceId, 'alliance'],
  ];
  for (const [id, via] of chain) {
    if (id === null) continue;
    const value = contacts.get(id);
    if (value !== undefined) return { band: standingBand(value), value, via };
  }
  return null;
}
