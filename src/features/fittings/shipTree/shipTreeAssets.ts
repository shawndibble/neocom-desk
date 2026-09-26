/**
 * The Ship Tree's CCP art, kept in the app under `public/images/ship-tree/`
 * (scope decision `20260926-135538`): ISIS class icons and faction emblems.
 * CONCORD, EDENCOM, the Society and the Deathless have no emblem there.
 */
const BASE = `${import.meta.env.BASE_URL}images/ship-tree`;

const FACTION_EMBLEM: Readonly<Record<number, string>> = {
  500001: 'caldari',
  500002: 'minmatar',
  500003: 'amarr',
  500004: 'gallente',
  500010: 'guristas',
  500011: 'angel',
  500012: 'blood_raiders',
  500014: 'ore',
  500016: 'soe',
  500018: 'mordus',
  500019: 'sansha',
  500020: 'serpentis',
  500026: 'triglavian',
};

/** A class's ISIS icon; `icon` is the group's lower-cased basename. */
export function classIconUrl(icon: string): string {
  return `${BASE}/class/${icon || 'frigate'}.png`;
}

/** The capsule the tree starts from. */
export const CAPSULE_ICON_URL = `${BASE}/class/capsule.png`;

/** A faction's emblem, or null for one the art set has none for. */
export function factionEmblemUrl(factionID: number): string | null {
  const file = FACTION_EMBLEM[factionID];
  return file ? `${BASE}/faction/${file}.png` : null;
}
