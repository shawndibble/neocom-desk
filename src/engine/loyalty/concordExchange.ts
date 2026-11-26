export const CONCORD_RATE_EMPIRE = 0.8;

export const CONCORD_RATE_OTHER = 0.4;

const EMPIRE_FACTION_IDS: ReadonlySet<number> = new Set([
  500001, 500002, 500003, 500004, 500007, 500008,
]);

const OTHER_FACTION_IDS: ReadonlySet<number> = new Set([
  500009, 500014, 500015, 500016, 500017, 500018, 500019,
]);

const FOOD_RELIEF_ID = 1000139;
const THE_SANCTUARY_ID = 1000159;

export interface ConcordRate {
  rate: number;
  basis: 'verified' | 'assumed';
}

export function concordRate(corp: { id: number; factionId?: number }): ConcordRate | null {
  const { factionId } = corp;
  if (factionId === undefined) return null;
  if (EMPIRE_FACTION_IDS.has(factionId)) return { rate: CONCORD_RATE_EMPIRE, basis: 'verified' };
  if (OTHER_FACTION_IDS.has(factionId)) {
    if (corp.id === FOOD_RELIEF_ID || corp.id === THE_SANCTUARY_ID) return null;
    return { rate: CONCORD_RATE_OTHER, basis: 'assumed' };
  }
  return null;
}

export function iskPerConcordLp(iskPerLp: number | null, rate: number): number | null {
  return iskPerLp === null ? null : iskPerLp * rate;
}
