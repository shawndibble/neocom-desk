/**
 * A pilot's standing from the active Character's own contact list: the
 * pilot's contact if they have one, else their corporation's, else their
 * alliance's (the most specific match wins). Pure; the list is fetched
 * elsewhere.
 */
export type StandingBand = 'red' | 'orange' | 'neutral' | 'blue';

export interface ContactStanding {
  band: StandingBand;
  /** The raw ESI standing, -10 to 10. */
  value: number;
  /** Which contact it came from. */
  via: 'character' | 'corporation' | 'alliance';
}

/** ESI standings come in steps of 5: -10 red, -5 orange, 0 neutral, +5 and +10 blue. */
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
