const BASE = `${import.meta.env.BASE_URL}images/ship-tree`;

const FACTION_EMBLEM: Readonly<Record<number, string>> = {
  500001: 'caldari',
  500002: 'minmatar',
  500003: 'amarr',
  500004: 'gallente',
  500006: 'concord',
  500010: 'guristas',
  500011: 'angel',
  500012: 'blood_raiders',
  500014: 'ore',
  500016: 'soe',
  500017: 'society',
  500018: 'mordus',
  500019: 'sansha',
  500020: 'serpentis',
  500026: 'triglavian',
  500027: 'edencom',
  500029: 'deathless',
};

export function classIconUrl(icon: string): string {
  return `${BASE}/class/${icon || 'frigate'}.png`;
}

export const CAPSULE_ICON_URL = `${BASE}/class/capsule.png`;

export function factionEmblemUrl(factionID: number): string | null {
  const file = FACTION_EMBLEM[factionID];
  return file ? `${BASE}/faction/${file}.png` : null;
}
